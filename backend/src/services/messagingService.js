import { q, PLAN_PRESETS, DEFAULT_TELECOM_SETTINGS } from '../db.js';
import { senders, detectTelecomOperator, normalizeDrcMsisdn } from '../providers/index.js';
import { signWebhookPayload } from '../middleware/security.js';

export let queueWorkerStats = {
  running: false,
  lastTickAt: null,
  processedScheduledMessages: 0,
  processedCampaigns: 0
};

/**
 * Récupère les paramètres maîtres des passerelles télécoms définis dans le C-Panel
 */
export async function getMasterSettings() {
  const [master] = await q(
    `SELECT t.settings FROM tenants t
     JOIN users u ON u.tenant_id = t.id
     WHERE u.role = 'superadmin'
     ORDER BY t.id ASC LIMIT 1`
  );
  const saved = master?.settings || {};
  return {
    ...DEFAULT_TELECOM_SETTINGS,
    ...saved,
    telecom: {
      ...DEFAULT_TELECOM_SETTINGS.telecom,
      ...(saved.telecom || {}),
      vodacom: { ...DEFAULT_TELECOM_SETTINGS.telecom.vodacom, ...(saved.telecom?.vodacom || {}) },
      airtel: { ...DEFAULT_TELECOM_SETTINGS.telecom.airtel, ...(saved.telecom?.airtel || {}) },
      orange: { ...DEFAULT_TELECOM_SETTINGS.telecom.orange, ...(saved.telecom?.orange || {}) },
      africell: { ...DEFAULT_TELECOM_SETTINGS.telecom.africell, ...(saved.telecom?.africell || {}) }
    },
    whatsapp: { ...DEFAULT_TELECOM_SETTINGS.whatsapp, ...(saved.whatsapp || {}) },
    rcs: { ...DEFAULT_TELECOM_SETTINGS.rcs, ...(saved.rcs || {}) },
    emailDirect: { ...DEFAULT_TELECOM_SETTINGS.emailDirect, ...(saved.emailDirect || {}) }
  };
}

/**
 * Calcule l'utilisation courante et les plafonds d'un client SaaS
 */
export async function getTenantUsageAndLimits(tid) {
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) throw new Error('Compte client introuvable');

  const preset = PLAN_PRESETS[t.plan] || PLAN_PRESETS.business;
  const limits = { ...preset, ...(t.limits || {}) };

  const [cRow] = await q('SELECT count(*)::int AS n FROM contacts WHERE tenant_id=$1', [tid]);
  const [mRow] = await q(
    `SELECT
       count(*) FILTER (WHERE channel='sms' AND direction='out')::int AS sms,
       count(*) FILTER (WHERE channel='whatsapp' AND direction='out')::int AS whatsapp,
       count(*) FILTER (WHERE channel='rcs' AND direction='out')::int AS rcs,
       count(*) FILTER (WHERE channel='email' AND direction='out')::int AS email,
       COALESCE(sum(cost), 0)::float AS spend,
       COALESCE(sum(buy_cost), 0)::float AS buy_spend
     FROM messages WHERE tenant_id=$1`,
    [tid]
  );

  return {
    tenant: t,
    limits,
    usage: {
      contacts: cRow?.n || 0,
      sms: mRow?.sms || 0,
      whatsapp: mRow?.whatsapp || 0,
      rcs: mRow?.rcs || 0,
      email: mRow?.email || 0,
      spendUsd: Number(mRow?.spend || 0),
      buySpendUsd: Number(mRow?.buy_spend || 0)
    }
  };
}

/**
 * Normalise un numéro de téléphone et enrichit automatiquement les tags avec l'opérateur RDC détecté
 */
export function normalizePhoneAndTags(phone = '', rawTags = []) {
  const cleanPhone = (phone || '').trim();
  const op = detectTelecomOperator(cleanPhone);
  const tagSet = new Set(
    (Array.isArray(rawTags) ? rawTags : String(rawTags || '').split(/[;,]/))
      .map(t => t.trim())
      .filter(Boolean)
  );
  if (cleanPhone && op.key !== 'default') {
    const opTag = op.label.replace(' RDC', '');
    tagSet.add(opTag);
  }
  return { cleanPhone, tags: Array.from(tagSet), operatorKey: op.key, operatorLabel: op.label };
}

/**
 * Vérifie si un numéro ou email figure dans la liste noire (Opt-Out / STOP SMS) du client
 */
export async function isAddressBlacklisted(tid, addr = '') {
  if (!addr) return false;
  const digits = String(addr).replace(/\D/g, '');
  if (digits.length >= 8) {
    const rows = await q(
      "SELECT id FROM blacklist WHERE tenant_id=$1 AND regexp_replace(addr,'\\D','','g')=$2 LIMIT 1",
      [tid, digits]
    );
    return rows.length > 0;
  }
  const rows = await q('SELECT id FROM blacklist WHERE tenant_id=$1 AND lower(addr)=lower($2) LIMIT 1', [
    tid,
    String(addr).trim()
  ]);
  return rows.length > 0;
}

/**
 * Envoie un événement signé HMAC-SHA256 vers le Webhook configuré par le client SaaS
 */
export async function dispatchClientWebhook(tid, eventName, payloadObj) {
  try {
    const [t] = await q('SELECT api_key, settings FROM tenants WHERE id=$1', [tid]);
    const clientWebhook = t?.settings?.clientWebhookUrl;
    if (!clientWebhook || !clientWebhook.startsWith('http')) return;

    const fullBody = {
      event: eventName,
      timestamp: new Date().toISOString(),
      ...payloadObj
    };
    const rawJson = JSON.stringify(fullBody);
    const sig = signWebhookPayload(rawJson, t?.api_key || '');

    fetch(clientWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Rayons-Event': eventName,
        'X-Rayons-Signature': sig
      },
      body: rawJson
    }).catch(() => {});
  } catch {
    // Ignorer les erreurs réseau du webhook client
  }
}

/**
 * Met à jour les compteurs agrégés d'une campagne (sent_count, delivered_count, failed_count, total_cost)
 */
export async function syncCampaignCounters(campaignId) {
  if (!campaignId) return;
  const [agg] = await q(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status IN ('sent','delivered'))::int AS sent_n,
       count(*) FILTER (WHERE status = 'delivered')::int AS deliv_n,
       count(*) FILTER (WHERE status = 'failed')::int AS fail_n,
       count(*) FILTER (WHERE status = 'queued')::int AS queued_n,
       COALESCE(sum(cost), 0)::float AS cost_sum
     FROM messages WHERE campaign_id=$1`,
    [campaignId]
  );
  if (!agg) return;
  const nextStatus = agg.queued_n > 0 ? 'scheduled' : 'completed';
  await q(
    `UPDATE campaigns
     SET total_recipients=$1, sent_count=$2, delivered_count=$3, failed_count=$4, total_cost=$5, status=$6
     WHERE id=$7`,
    [agg.total, agg.sent_n, agg.deliv_n, agg.fail_n, agg.cost_sum, nextStatus, campaignId]
  );
}

/**
 * Normalise un statut DLR opérateur (SMPP / Orange SDP / Vodacom / Airtel / Africell)
 */
export function normalizeDlrStatus(rawStatus = '', rawErr = '000') {
  const up = String(rawStatus).toUpperCase();
  if (
    up.includes('DELIV') ||
    up === 'DELIVEREDTOTERMINAL' ||
    up === 'SUCCESS' ||
    up === '1' ||
    up === '2'
  ) {
    return { status: 'delivered', dlrCode: `DELIVRD ${rawErr || '000'}` };
  }
  if (
    up.includes('UNDELIV') ||
    up.includes('REJECT') ||
    up.includes('FAIL') ||
    up.includes('EXPIRED') ||
    up === 'DELIVERYIMPOSSIBLE'
  ) {
    return { status: 'failed', dlrCode: `${up.slice(0, 7)} ${rawErr || '027'}` };
  }
  return { status: 'sent', dlrCode: `ACCEPTD ${rawErr || '000'}` };
}

/**
 * Traite un accusé de réception (DLR) provenant d'un opérateur télécom
 */
export async function processDlrEvent({ providerId, txRef, operator, rawStatus, rawErr = '000', rawPayload = {} }) {
  const { status, dlrCode } = normalizeDlrStatus(rawStatus, rawErr);

  let msgRows = [];
  if (providerId) {
    msgRows = await q('SELECT * FROM messages WHERE provider_id=$1 ORDER BY id DESC LIMIT 1', [providerId]);
  }
  if (msgRows.length === 0 && txRef) {
    msgRows = await q('SELECT * FROM messages WHERE tx_ref=$1 ORDER BY id DESC LIMIT 1', [txRef]);
  }

  const msg = msgRows[0];
  const resolvedOperator = operator || msg?.operator || 'Passerelle Télécom Directe';
  const resolvedTxRef = msg?.tx_ref || txRef || null;
  const resolvedProviderId = msg?.provider_id || providerId || null;

  if (msg) {
    await q(
      `UPDATE messages
       SET status=$1,
           dlr_code=$2,
           delivered_at = CASE WHEN $1='delivered' THEN now() ELSE delivered_at END,
           error = CASE WHEN $1='failed' THEN $3 ELSE error END
       WHERE id=$4`,
      [status, dlrCode, status === 'failed' ? `Rejet opérateur (${dlrCode})` : null, msg.id]
    );

    if (msg.campaign_id) {
      await syncCampaignCounters(msg.campaign_id);
    }
  }

  const [whLog] = await q(
    `INSERT INTO webhook_logs(tenant_id, operator, event_type, provider_id, tx_ref, msisdn, status, dlr_code, latency_ms, raw_payload)
     VALUES($1, $2, 'dlr', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      msg?.tenant_id || null,
      resolvedOperator,
      resolvedProviderId,
      resolvedTxRef,
      msg?.addr || rawPayload.msisdn || rawPayload.to || null,
      status,
      dlrCode,
      msg?.latency_ms || 38,
      JSON.stringify(rawPayload)
    ]
  );

  if (msg?.tenant_id) {
    await dispatchClientWebhook(msg.tenant_id, 'message.dlr', {
      txRef: resolvedTxRef,
      providerId: resolvedProviderId,
      to: msg.addr,
      operator: resolvedOperator,
      status,
      dlrCode
    });
  }

  return { ok: true, matchedMessageId: msg?.id || null, txRef: resolvedTxRef, status, dlrCode, log: whLog };
}

/**
 * Traite un message entrant (MO) et détecte automatiquement les mots-clés STOP / ARRET / START (Opt-out télécom)
 */
/**
 * Normalise une chaîne pour la détection insensible à la casse et aux accents
 */
function normalizeSearchText(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Traite un message entrant (MO), détecte les mots-clés STOP / START (Opt-out télécom)
 * et exécute l'Auto-répondeur intelligent par mots-clés
 */
export async function inbound(tid, channel, addr, body, providerId, customOperator, subject = null) {
  const clean = (addr || '').replace(/^(whatsapp:|rcs:|tel:|mailto:)/i, '').trim();
  const isEmail = channel === 'email' || clean.includes('@');
  const op =
    customOperator ||
    (isEmail
      ? 'Email Direct (Entrant)'
      : channel === 'whatsapp'
      ? 'WhatsApp Direct'
      : channel === 'rcs'
      ? `${detectTelecomOperator(clean).label} (RCS)`
      : detectTelecomOperator(clean).label);

  const normalizedIncoming = normalizeSearchText(body || '');
  const isStopKeyword = ['STOP', 'ARRET', 'UNSUBSCRIBE', 'DESABONNER'].includes(normalizedIncoming);
  const isStartKeyword = ['START', 'OUI', 'SUBSCRIBE', 'ACTIVER'].includes(normalizedIncoming);

  if (isStopKeyword && clean) {
    await q(
      `INSERT INTO blacklist(tenant_id, addr, reason)
       VALUES($1, $2, 'STOP reçu de l’abonné')
       ON CONFLICT (tenant_id, addr) DO NOTHING`,
      [tid, clean]
    );
  } else if (isStartKeyword && clean) {
    if (isEmail) {
      await q('DELETE FROM blacklist WHERE tenant_id=$1 AND lower(addr)=lower($2)', [tid, clean]);
    } else {
      await q(
        "DELETE FROM blacklist WHERE tenant_id=$1 AND regexp_replace(addr,'\\D','','g') = regexp_replace($2,'\\D','','g')",
        [tid, clean]
      );
    }
  }

  let c;
  if (isEmail) {
    [c] = await q(
      'SELECT * FROM contacts WHERE tenant_id=$1 AND lower(coalesce(email, \'\')) = lower($2) LIMIT 1',
      [tid, clean]
    );
    if (!c) {
      [c] = await q(
        'INSERT INTO contacts(tenant_id,name,email,tags) VALUES($1,$2,$3,$4) RETURNING *',
        [tid, clean.split('@')[0] || clean, clean, ['Entrant Email']]
      );
    }
  } else {
    [c] = await q(
      "SELECT * FROM contacts WHERE tenant_id=$1 AND regexp_replace(coalesce(phone,''),'\\D','','g') = regexp_replace($2,'\\D','','g') LIMIT 1",
      [tid, clean]
    );
    if (!c) {
      const norm = normalizePhoneAndTags(clean, ['Entrant MO']);
      [c] = await q(
        'INSERT INTO contacts(tenant_id,name,phone,tags) VALUES($1,$2,$3,$4) RETURNING *',
        [tid, clean, norm.cleanPhone || clean, norm.tags]
      );
    }
  }

  const dlrCode = isStopKeyword ? 'MO_OPT_OUT' : channel === 'rcs' ? 'RBM_REPLY' : 'MO_INBOUND';
  const [m] = await q(
    `INSERT INTO messages(tenant_id,contact_id,channel,direction,addr,sender_addr,operator,subject,body,status,dlr_code,provider_id,cost,buy_cost,latency_ms,is_read)
     VALUES($1,$2,$3,'in',$4,$4,$5,$6,$7,'received',$8,$9,0,0,18,false) RETURNING *`,
    [tid, c.id, channel, clean, op, subject, body, dlrCode, providerId]
  );
  const txRef = `RAY-${1000 + m.id}`;
  await q('UPDATE messages SET tx_ref=$1 WHERE id=$2', [txRef, m.id]);

  await q(
    `INSERT INTO webhook_logs(tenant_id, operator, event_type, provider_id, tx_ref, msisdn, status, dlr_code, latency_ms, raw_payload)
     VALUES($1, $2, 'inbound_mo', $3, $4, $5, 'received', $6, 18, $7)`,
    [
      tid,
      op,
      providerId,
      txRef,
      clean,
      dlrCode,
      JSON.stringify({ from: clean, body, channel, operator: op, optOut: isStopKeyword })
    ]
  );

  await dispatchClientWebhook(tid, 'message.inbound', {
    txRef,
    from: clean,
    body,
    channel,
    operator: op,
    optOut: isStopKeyword
  });

  // Évaluation de l'Auto-répondeur par mots-clés (si ce n'est pas un STOP)
  let autoReplyResult = null;
  let matchedRule = null;

  if (!isStopKeyword && normalizedIncoming) {
    const rules = await q(
      `SELECT * FROM auto_reply_rules
       WHERE tenant_id=$1 AND is_active=true
       ORDER BY CASE WHEN match_type='any' THEN 2 ELSE 1 END ASC, id ASC`,
      [tid]
    );

    for (const rule of rules) {
      if (rule.channel && rule.channel !== 'all' && rule.channel !== channel) continue;

      if (rule.match_type === 'any') {
        matchedRule = rule;
        break;
      }

      const keywords = String(rule.keyword || '')
        .split(/[,;|]+/)
        .map(k => normalizeSearchText(k))
        .filter(Boolean);

      const isMatch = keywords.some(kw => {
        if (rule.match_type === 'exact') return normalizedIncoming === kw;
        if (rule.match_type === 'starts_with') return normalizedIncoming.startsWith(kw);
        return normalizedIncoming.includes(kw); // 'contains' par défaut
      });

      if (isMatch) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      // Ajouter le tag automatique au contact si configuré
      if (matchedRule.add_tag && matchedRule.add_tag.trim()) {
        const cleanTag = matchedRule.add_tag.trim();
        const currentTags = Array.isArray(c.tags) ? c.tags : [];
        if (!currentTags.includes(cleanTag)) {
          const updatedTags = [...currentTags, cleanTag];
          await q('UPDATE contacts SET tags=$1 WHERE id=$2', [updatedTags, c.id]);
          c.tags = updatedTags;
        }
      }

      // Incrémenter le compteur de déclenchement de la règle
      await q(
        'UPDATE auto_reply_rules SET trigger_count = COALESCE(trigger_count, 0) + 1, last_triggered_at = now() WHERE id=$1',
        [matchedRule.id]
      );

      // Envoyer la réponse automatique au contact
      const [tenant] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
      const [u] = await q('SELECT email FROM users WHERE tenant_id=$1 ORDER BY id ASC LIMIT 1', [tid]);
      const masterSettings = await getMasterSettings();
      const effectiveCfg = {
        ...masterSettings,
        emailDirect: tenant?.settings?.emailDirect || masterSettings.emailDirect || {}
      };

      const targetReplyChannel =
        !matchedRule.reply_channel || matchedRule.reply_channel === 'same'
          ? channel
          : matchedRule.reply_channel;

      const companyName = tenant?.name || 'Rayons CRM';
      const userEmail = u?.email || 'contact@rayons.cd';

      const personalBody = String(matchedRule.reply_body || '')
        .replaceAll('{{name}}', c.name || 'Client')
        .replaceAll('{{phone}}', c.phone || clean)
        .replaceAll('{{email}}', c.email || '')
        .replaceAll('{{company}}', companyName);

      const personalSubj = String(matchedRule.reply_subject || `Réponse automatique — ${companyName}`)
        .replaceAll('{{name}}', c.name || 'Client')
        .replaceAll('{{company}}', companyName);

      autoReplyResult = await sendOne(tid, effectiveCfg, targetReplyChannel, c, {
        subject: personalSubj,
        body: personalBody,
        metadata: {
          ...(matchedRule.reply_metadata || {}),
          isAutoReply: true,
          autoReplyRuleId: matchedRule.id,
          autoReplyRuleName: matchedRule.name
        },
        userEmail,
        companyName,
        customSenderId: tenant?.sender_id || 'RAYONS'
      });
    }
  }

  return {
    ...m,
    tx_ref: txRef,
    contact_name: c.name,
    contact_id: c.id,
    optOut: isStopKeyword,
    autoReplyTriggered: Boolean(matchedRule),
    autoReplyRuleName: matchedRule?.name || null,
    autoReplyTagAdded: matchedRule?.add_tag || null,
    autoReplyResult
  };
}

/**
 * Exécute la transmission effective d'un message déjà inséré en base
 */
export async function executeMessageDispatch(messageId, effectiveCfg, { userEmail, companyName, customSenderId }) {
  const [m] = await q('SELECT * FROM messages WHERE id=$1', [messageId]);
  if (!m) return { ok: false, error: 'Message introuvable' };

  const txRef = m.tx_ref || `RAY-${1000 + m.id}`;
  const addr = m.addr;
  const channel = m.channel;
  const metadata = m.metadata || {};
  const opInfo = detectTelecomOperator(addr || '');
  const baseWebhook = process.env.PUBLIC_URL || 'http://localhost:4000';
  const dlrWebhookUrl = `${baseWebhook}/webhooks/dlr/${opInfo.key}?txRef=${encodeURIComponent(txRef)}`;

  try {
    if (!addr) throw new Error(`Le contact n'a pas de ${channel === 'email' ? 'email' : 'téléphone'}`);

    const blacklisted = await isAddressBlacklisted(m.tenant_id, addr);
    if (blacklisted) {
      throw new Error('Destinataire désabonné (Liste noire / STOP SMS)');
    }

    const out = await senders[channel](effectiveCfg, {
      to: addr,
      subject: m.subject,
      body: m.body,
      metadata,
      txRef,
      tenantId: m.tenant_id,
      userEmail,
      companyName,
      customSenderId: customSenderId || m.sender_addr,
      dlrWebhookUrl
    });

    const pid = typeof out === 'object' ? out.providerId : out;
    const operator = (typeof out === 'object' && out.operator) || m.operator;
    const senderAddr =
      (typeof out === 'object' && out.senderAddr) ||
      (channel === 'email' ? userEmail : (customSenderId || m.sender_addr || 'RAYONS'));
    const cost = typeof out === 'object' && out.cost != null ? out.cost : 0;
    const buyCost = typeof out === 'object' && out.buyCost != null ? out.buyCost : 0;
    const latencyMs = typeof out === 'object' && out.latencyMs != null ? out.latencyMs : 35;
    const mode = typeof out === 'object' ? out.mode : 'sandbox_dlr';

    await q(
      `UPDATE messages
       SET status='sent', provider_id=$1, operator=$2, sender_addr=$3, cost=$4, buy_cost=$5, latency_ms=$6, dlr_code=$7, tx_ref=$8, error=NULL
       WHERE id=$9`,
      [
        pid,
        operator,
        senderAddr,
        cost,
        buyCost,
        latencyMs,
        channel === 'email' ? '250 2.0.0 OK' : channel === 'rcs' ? 'RBM_SENT 000' : 'ACCEPTD 000',
        txRef,
        m.id
      ]
    );

    if (m.campaign_id) {
      await syncCampaignCounters(m.campaign_id);
    }

    // En mode simulation réseau réaliste (sandbox_dlr), déclencher l'accusé de réception opérateur (DLR) après 1.1s
    if (mode === 'sandbox_dlr') {
      setTimeout(() => {
        processDlrEvent({
          providerId: pid,
          txRef,
          operator,
          rawStatus: 'DELIVRD',
          rawErr: channel === 'email' ? '250' : channel === 'rcs' ? 'RBM_READ' : '000',
          rawPayload: {
            id: pid,
            txRef,
            msisdn: channel === 'email' ? addr : normalizeDrcMsisdn(addr).msisdn,
            operator,
            stat: 'DELIVRD',
            err: channel === 'email' ? '250' : '000',
            dlvrd: '001'
          }
        }).catch(() => {});
      }, 1100);
    }

    return { contactId: m.contact_id, txRef, providerId: pid, operator, senderAddr, latencyMs, cost, ok: true };
  } catch (e) {
    await q(
      "UPDATE messages SET status='failed', dlr_code='REJECTD', error=$1, tx_ref=$2, retry_count = COALESCE(retry_count, 0) + 1 WHERE id=$3",
      [e.message, txRef, m.id]
    );
    if (m.campaign_id) {
      await syncCampaignCounters(m.campaign_id);
    }
    return { contactId: m.contact_id, txRef, ok: false, error: e.message };
  }
}

/**
 * Crée un message sortant et l'envoie immédiatement (ou le met en file d'attente si scheduledAt est dans le futur)
 */
export async function sendOne(
  tid,
  effectiveCfg,
  channel,
  contact,
  { subject, body, template, metadata = {}, userEmail, companyName, customSenderId, campaignId = null, scheduledAt = null }
) {
  const addr = channel === 'email' ? contact.email : contact.phone;
  const opInfo = detectTelecomOperator(addr || '');
  const defaultOp =
    channel === 'email'
      ? `Email Direct (${userEmail})`
      : channel === 'whatsapp'
      ? 'WhatsApp Direct'
      : channel === 'rcs'
      ? `${opInfo.label} (RCS)`
      : opInfo.label;

  const isFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;

  const [m] = await q(
    `INSERT INTO messages(tenant_id,contact_id,campaign_id,channel,direction,addr,sender_addr,operator,subject,body,metadata,status,dlr_code,scheduled_at)
     VALUES($1,$2,$3,$4,'out',$5,$6,$7,$8,$9,$10,'queued',$11,$12) RETURNING id`,
    [
      tid,
      contact.id,
      campaignId,
      channel,
      addr,
      channel === 'email' ? userEmail : (customSenderId || 'RAYONS'),
      defaultOp,
      subject,
      body,
      JSON.stringify(metadata || {}),
      isFuture ? 'SCHEDULED' : 'QUEUED',
      isFuture ? new Date(scheduledAt).toISOString() : null
    ]
  );
  const txRef = `RAY-${1000 + m.id}`;
  await q('UPDATE messages SET tx_ref=$1 WHERE id=$2', [txRef, m.id]);

  if (isFuture) {
    if (campaignId) await syncCampaignCounters(campaignId);
    return {
      contactId: contact.id,
      txRef,
      operator: defaultOp,
      senderAddr: channel === 'email' ? userEmail : (customSenderId || 'RAYONS'),
      scheduled: true,
      scheduledAt,
      ok: true
    };
  }

  return executeMessageDispatch(m.id, effectiveCfg, {
    userEmail,
    companyName,
    customSenderId
  });
}

/**
 * Worker d'arrière-plan (Queue & Campagnes programmées)
 */
export function startQueueWorker(intervalMs = 5000) {
  if (queueWorkerStats.running) return;
  queueWorkerStats.running = true;

  setInterval(async () => {
    try {
      queueWorkerStats.lastTickAt = new Date().toISOString();
      const dueMessages = await q(
        `SELECT m.*, t.name AS company_name, t.sender_id AS tenant_sender, t.settings AS tenant_settings,
                (SELECT u.email FROM users u WHERE u.tenant_id = m.tenant_id ORDER BY u.id ASC LIMIT 1) AS user_email
         FROM messages m
         JOIN tenants t ON t.id = m.tenant_id
         WHERE m.direction = 'out'
           AND m.status = 'queued'
           AND m.scheduled_at IS NOT NULL
           AND m.scheduled_at <= now()
         ORDER BY m.scheduled_at ASC
         LIMIT 50`
      );

      if (dueMessages.length === 0) return;

      const masterSettings = await getMasterSettings();
      const touchedCampaigns = new Set();

      for (const msg of dueMessages) {
        const effectiveCfg = {
          ...masterSettings,
          emailDirect: msg.tenant_settings?.emailDirect || masterSettings.emailDirect || {}
        };
        await executeMessageDispatch(msg.id, effectiveCfg, {
          userEmail: msg.user_email || 'contact@rayons.cd',
          companyName: msg.company_name,
          customSenderId: msg.tenant_sender || 'RAYONS'
        });
        queueWorkerStats.processedScheduledMessages += 1;
        if (msg.campaign_id) touchedCampaigns.add(msg.campaign_id);
      }

      for (const cid of touchedCampaigns) {
        await syncCampaignCounters(cid);
        queueWorkerStats.processedCampaigns += 1;
      }
    } catch (e) {
      console.error('Queue worker error:', e.message);
    }
  }, intervalMs);
}

