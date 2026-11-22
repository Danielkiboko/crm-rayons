import { q } from '../db.js';
import {
  getMasterSettings,
  normalizePhoneAndTags,
  sendOne
} from '../services/messagingService.js';
import { assertChannelBalance, recordAccountingEntry } from '../core/accountingService.js';

/**
 * Résout la liste des contacts cibles pour un envoi unitaire ou une campagne sur un canal donné
 */
export async function resolveRecipientsForChannel(tenantId, channel, payload = {}) {
  const { contactId, contactIds = [], to, manualRecipients = [], filterOperator = 'all', filterTag = 'all' } = payload;
  const targets = [];
  const seenKeys = new Set();

  const addTarget = c => {
    const key = channel === 'email' ? (c.email || '').trim().toLowerCase() : (c.phone || '').replace(/\D/g, '');
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    targets.push(c);
  };

  if (contactId) {
    const [c] = await q('SELECT * FROM contacts WHERE id=$1 AND tenant_id=$2', [Number(contactId), tenantId]);
    if (c) addTarget(c);
  }

  if (Array.isArray(contactIds) && contactIds.length > 0) {
    const rows = await q('SELECT * FROM contacts WHERE tenant_id=$1 AND id = ANY($2::int[])', [
      tenantId,
      contactIds.map(Number).filter(Boolean)
    ]);
    rows.forEach(addTarget);
  } else if (payload.selectAllContacts) {
    const rows = await q('SELECT * FROM contacts WHERE tenant_id=$1 ORDER BY id DESC', [tenantId]);
    for (const c of rows) {
      if (filterTag && filterTag !== 'all' && !(c.tags || []).includes(filterTag)) continue;
      if (filterOperator && filterOperator !== 'all' && channel !== 'email') {
        const norm = normalizePhoneAndTags(c.phone || '');
        if (norm.operatorKey !== filterOperator) continue;
      }
      addTarget(c);
    }
  }

  const rawDirect = [
    ...(to ? [{ to, name: payload.recipientName || to }] : []),
    ...(Array.isArray(manualRecipients) ? manualRecipients : [])
  ];

  for (const item of rawDirect) {
    const addr = String(typeof item === 'string' ? item : item.to || item.phone || item.email || '').trim();
    const name = (typeof item === 'object' && item.name) || addr;
    if (!addr) continue;
    let [existing] = await q(
      'SELECT * FROM contacts WHERE tenant_id=$1 AND (phone=$2 OR email=$2) LIMIT 1',
      [tenantId, addr]
    );
    if (!existing) {
      const norm = normalizePhoneAndTags(channel === 'email' ? '' : addr, [channel.toUpperCase()]);
      [existing] = await q(
        'INSERT INTO contacts(tenant_id, name, phone, email, tags) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [tenantId, name, channel === 'email' ? '' : norm.cleanPhone, channel === 'email' ? addr : '', norm.tags]
      );
    }
    addTarget(existing);
  }

  return targets;
}

/**
 * Exécute un envoi unitaire sur un canal via le noyau central (comptabilité + dispatch)
 */
export async function executeChannelSingle({ tenantId, userEmail, channel, payload = {} }) {
  const { body = '', subject = '', metadata = {}, scheduledAt = null } = payload;
  if (!String(body).trim()) {
    const err = new Error('Le contenu du message est requis.');
    err.statusCode = 400;
    throw err;
  }

  const targets = await resolveRecipientsForChannel(tenantId, channel, payload);
  if (targets.length === 0) {
    const err = new Error(
      channel === 'email'
        ? 'Aucun destinataire avec une adresse email valide.'
        : 'Aucun destinataire avec un numéro de téléphone valide.'
    );
    err.statusCode = 400;
    throw err;
  }

  const acct = await assertChannelBalance(tenantId, channel, 1);
  const master = await getMasterSettings();
  const effectiveCfg = {
    ...master,
    emailDirect: {
      ...(master.emailDirect || {}),
      ...(acct.tenant.settings?.emailDirect || {})
    }
  };

  const contact = targets[0];
  const personalizedBody = String(body)
    .replaceAll('{{name}}', contact.name || 'Client')
    .replaceAll('{{company}}', acct.tenant.name || 'Rayons CRM')
    .replaceAll('{{phone}}', contact.phone || '')
    .replaceAll('{{email}}', contact.email || '');

  const out = await sendOne(tenantId, effectiveCfg, channel, contact, {
    subject: String(subject || '').replaceAll('{{name}}', contact.name || 'Client').replaceAll('{{company}}', acct.tenant.name || ''),
    body: personalizedBody,
    metadata,
    userEmail,
    companyName: acct.tenant.name,
    customSenderId: acct.tenant.sender_id || 'RAYONS',
    scheduledAt
  });

  if (out.ok && !out.scheduled) {
    await recordAccountingEntry({
      tenantId,
      entryType: 'message_debit',
      channel,
      quantity: -1,
      amountUsd: Number(out.cost || 0),
      buyCostUsd: Number(out.buyCost || 0),
      reference: out.txRef || '',
      note: `Envoi ${channel.toUpperCase()} vers ${contact.phone || contact.email}`,
      actorEmail: userEmail
    });
  }

  return { ...out, to: contact.phone || contact.email };
}

/**
 * Exécute une campagne de masse dédiée à un canal avec vérification préalable du solde total
 */
export async function executeChannelCampaign({ tenantId, userEmail, channel, payload = {} }) {
  const { name, subject = '', body = '', metadata = {}, scheduledAt = null } = payload;
  if (!String(body).trim()) {
    const err = new Error('Le contenu de la campagne est requis.');
    err.statusCode = 400;
    throw err;
  }

  const targets = await resolveRecipientsForChannel(tenantId, channel, payload);
  if (targets.length === 0) {
    const err = new Error('Sélectionnez au moins un destinataire valide pour cette campagne.');
    err.statusCode = 400;
    throw err;
  }

  const acct = await assertChannelBalance(tenantId, channel, targets.length);
  const master = await getMasterSettings();
  const effectiveCfg = {
    ...master,
    emailDirect: {
      ...(master.emailDirect || {}),
      ...(acct.tenant.settings?.emailDirect || {})
    }
  };

  const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;
  const campName = (name || `Campagne ${channel.toUpperCase()} — ${new Date().toLocaleDateString('fr-FR')}`).trim();

  const [camp] = await q(
    `INSERT INTO campaigns(tenant_id, name, channel, subject, body, status, scheduled_at, total_recipients, metadata)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      tenantId,
      campName,
      channel,
      subject || null,
      body,
      isScheduled ? 'scheduled' : 'processing',
      isScheduled ? new Date(scheduledAt).toISOString() : null,
      targets.length,
      JSON.stringify(metadata || {})
    ]
  );

  const results = [];
  let totalSell = 0;
  let totalBuy = 0;
  let okCount = 0;

  for (const contact of targets) {
    const personalizedBody = String(body)
      .replaceAll('{{name}}', contact.name || 'Client')
      .replaceAll('{{company}}', acct.tenant.name || 'Rayons CRM')
      .replaceAll('{{phone}}', contact.phone || '')
      .replaceAll('{{email}}', contact.email || '');

    const out = await sendOne(tenantId, effectiveCfg, channel, contact, {
      subject: String(subject || '').replaceAll('{{name}}', contact.name || 'Client').replaceAll('{{company}}', acct.tenant.name || ''),
      body: personalizedBody,
      metadata,
      userEmail,
      companyName: acct.tenant.name,
      customSenderId: acct.tenant.sender_id || 'RAYONS',
      campaignId: camp.id,
      scheduledAt
    });
    results.push(out);
    if (out.ok) {
      okCount++;
      totalSell += Number(out.cost || 0);
      totalBuy += Number(out.buyCost || 0);
    }
  }

  if (okCount > 0 && !isScheduled) {
    await recordAccountingEntry({
      tenantId,
      entryType: 'campaign_debit',
      channel,
      quantity: -okCount,
      amountUsd: Number(totalSell.toFixed(4)),
      buyCostUsd: Number(totalBuy.toFixed(4)),
      reference: `CAMP-${camp.id}`,
      note: `Campagne ${campName} (${okCount}/${targets.length} envoyés)`,
      actorEmail: userEmail
    });
  }

  const [updatedCamp] = await q('SELECT * FROM campaigns WHERE id=$1', [camp.id]);
  return {
    ok: true,
    campaign: updatedCamp || camp,
    total: results.length,
    succeeded: okCount,
    failed: results.length - okCount,
    totalCostUsd: Number(totalSell.toFixed(4)),
    results
  };
}
