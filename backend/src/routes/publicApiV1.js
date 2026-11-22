import { Router } from 'express';
import { q } from '../db.js';
import { apiKeyAuth, createRateLimiter } from '../middleware/security.js';
import {
  getMasterSettings,
  getTenantUsageAndLimits,
  normalizePhoneAndTags,
  sendOne
} from '../services/messagingService.js';

export const publicApiV1Router = Router();

const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

// Protection par clé API (X-API-Key) + Limiteur de débit (60 req / min par clé API)
publicApiV1Router.use(apiKeyAuth);
publicApiV1Router.use(createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: 'apiv1' }));

/**
 * GET /api/v1/balance
 * Consulte le solde télécom USD et les quotas restants du compte client
 */
publicApiV1Router.get('/balance', wrap(async (req, res) => {
  const { tenant, limits, usage } = await getTenantUsageAndLimits(req.tenant.id);
  const remainingUsd = Math.max(0, Number((limits.maxSpendUsd - usage.spendUsd).toFixed(4)));

  res.json({
    company: tenant.name,
    plan: tenant.plan,
    status: tenant.status,
    senderId: tenant.sender_id,
    balance: {
      currency: 'USD',
      maxSpendUsd: limits.maxSpendUsd,
      usedSpendUsd: usage.spendUsd,
      remainingSpendUsd: remainingUsd
    },
    quotas: {
      sms: { used: usage.sms, max: limits.maxSms, remaining: Math.max(0, limits.maxSms - usage.sms) },
      whatsapp: { used: usage.whatsapp, max: limits.maxWhatsapp, remaining: Math.max(0, limits.maxWhatsapp - usage.whatsapp) },
      rcs: { used: usage.rcs, max: limits.maxRcs, remaining: Math.max(0, limits.maxRcs - usage.rcs) },
      email: { used: usage.email, max: limits.maxEmails, remaining: Math.max(0, limits.maxEmails - usage.email) },
      contacts: { used: usage.contacts, max: limits.maxContacts, remaining: Math.max(0, limits.maxContacts - usage.contacts) }
    },
    allowedChannels: limits.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email']
  });
}));

/**
 * POST /api/v1/send
 * Envoi transactionnel unitaire (SMS, WhatsApp, RCS ou Email)
 */
publicApiV1Router.post('/send', wrap(async (req, res) => {
  const t = req.tenant;
  const { channel = 'sms', to, name = 'Client', subject = '', body, metadata = {}, scheduledAt = null } = req.body;
  if (!to || !body) {
    return res.status(400).json({ error: 'Champs "to" et "body" requis' });
  }

  const { limits, usage } = await getTenantUsageAndLimits(t.id);
  const allowed = limits.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];
  if (!allowed.includes(channel)) {
    return res.status(403).json({ error: `Canal ${channel} non autorisé dans votre forfait` });
  }
  if (channel !== 'email' && usage.spendUsd >= limits.maxSpendUsd) {
    return res.status(403).json({ error: 'Plafond de budget télécom USD atteint' });
  }

  const [u] = await q('SELECT email FROM users WHERE tenant_id=$1 ORDER BY id ASC LIMIT 1', [t.id]);
  const userEmail = u?.email || 'contact@rayons.cd';
  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    emailDirect: t.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  let [contact] = await q(
    'SELECT * FROM contacts WHERE tenant_id=$1 AND (phone=$2 OR email=$2) LIMIT 1',
    [t.id, to]
  );
  if (!contact) {
    const norm = normalizePhoneAndTags(channel === 'email' ? '' : to, ['API v1']);
    [contact] = await q(
      'INSERT INTO contacts(tenant_id, name, phone, email, tags) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [t.id, name, channel === 'email' ? '' : norm.cleanPhone, channel === 'email' ? to : '', norm.tags]
    );
  }

  const out = await sendOne(t.id, effectiveCfg, channel, contact, {
    subject,
    body: String(body).replaceAll('{{name}}', contact.name || name),
    metadata,
    userEmail,
    companyName: t.name,
    customSenderId: t.sender_id || 'RAYONS',
    scheduledAt
  });

  res.status(out.ok ? 200 : 400).json(out);
}));

/**
 * POST /api/v1/send-bulk
 * Envoi groupé en un seul appel API vers une liste de destinataires
 */
publicApiV1Router.post('/send-bulk', wrap(async (req, res) => {
  const t = req.tenant;
  const {
    campaignName = `API Bulk ${new Date().toISOString().slice(0, 10)}`,
    channel = 'sms',
    recipients = [],
    subject = '',
    body,
    metadata = {},
    scheduledAt = null
  } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0 || !body) {
    return res.status(400).json({
      error: 'Fournissez un tableau "recipients" (ex: [{"to":"+24381...","name":"Amina"}]) et "body".'
    });
  }

  const { limits, usage } = await getTenantUsageAndLimits(t.id);
  const allowed = limits.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];
  if (!allowed.includes(channel)) {
    return res.status(403).json({ error: `Canal ${channel} non autorisé dans votre forfait` });
  }
  if (channel !== 'email' && usage.spendUsd >= limits.maxSpendUsd) {
    return res.status(403).json({ error: 'Plafond de budget télécom USD atteint' });
  }

  const [u] = await q('SELECT email FROM users WHERE tenant_id=$1 ORDER BY id ASC LIMIT 1', [t.id]);
  const userEmail = u?.email || 'contact@rayons.cd';
  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    emailDirect: t.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;
  const [camp] = await q(
    `INSERT INTO campaigns(tenant_id, name, channel, subject, body, status, scheduled_at, total_recipients, metadata)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      t.id,
      campaignName,
      channel,
      subject,
      body,
      isScheduled ? 'scheduled' : 'processing',
      isScheduled ? new Date(scheduledAt).toISOString() : null,
      recipients.length,
      JSON.stringify(metadata || {})
    ]
  );

  const results = [];
  for (const item of recipients) {
    const to = typeof item === 'string' ? item : item.to || item.phone || item.email;
    const rName = (typeof item === 'object' && item.name) || to || 'Client';
    if (!to) continue;

    let [contact] = await q(
      'SELECT * FROM contacts WHERE tenant_id=$1 AND (phone=$2 OR email=$2) LIMIT 1',
      [t.id, to]
    );
    if (!contact) {
      const norm = normalizePhoneAndTags(channel === 'email' ? '' : to, ['API Bulk']);
      [contact] = await q(
        'INSERT INTO contacts(tenant_id, name, phone, email, tags) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [t.id, rName, channel === 'email' ? '' : norm.cleanPhone, channel === 'email' ? to : '', norm.tags]
      );
    }

    const personalized = String(body).replaceAll('{{name}}', contact.name || rName);
    results.push(
      await sendOne(t.id, effectiveCfg, channel, contact, {
        subject,
        body: personalized,
        metadata,
        userEmail,
        companyName: t.name,
        customSenderId: t.sender_id || 'RAYONS',
        campaignId: camp.id,
        scheduledAt
      })
    );
  }

  res.json({
    ok: true,
    campaignId: camp.id,
    total: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  });
}));

/**
 * GET /api/v1/messages/:txRef
 * Vérifie le statut de livraison (DLR) d'une transaction RAY-XXXX
 */
publicApiV1Router.get('/messages/:txRef', wrap(async (req, res) => {
  const [m] = await q(
    `SELECT tx_ref, channel, direction, addr, sender_addr, operator, status, dlr_code, latency_ms, cost, error, scheduled_at, delivered_at, created_at
     FROM messages
     WHERE tenant_id=$1 AND tx_ref=$2
     LIMIT 1`,
    [req.tenant.id, req.params.txRef]
  );
  if (!m) {
    return res.status(404).json({ error: `Transaction ${req.params.txRef} introuvable` });
  }
  res.json(m);
}));

/**
 * GET /api/v1/messages
 * Liste les dernières transactions du compte client via API
 */
publicApiV1Router.get('/messages', wrap(async (req, res) => {
  const { channel, status, limit = 50 } = req.query;
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const rows = await q(
    `SELECT tx_ref, channel, direction, addr, sender_addr, operator, status, dlr_code, latency_ms, cost, body, delivered_at, created_at
     FROM messages
     WHERE tenant_id=$1
       AND ($2::text IS NULL OR channel=$2)
       AND ($3::text IS NULL OR status=$3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [req.tenant.id, channel || null, status || null, safeLimit]
  );
  res.json({ count: rows.length, messages: rows });
}));

/**
 * GET /api/v1/contacts & POST /api/v1/contacts
 * Synchronisation des contacts depuis le système externe du client
 */
publicApiV1Router.get('/contacts', wrap(async (req, res) => {
  const rows = await q(
    'SELECT id, name, phone, email, tags, notes, created_at FROM contacts WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500',
    [req.tenant.id]
  );
  res.json({ count: rows.length, contacts: rows });
}));

publicApiV1Router.post('/contacts', wrap(async (req, res) => {
  const { name, phone = '', email = '', tags = [], notes = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Champ "name" requis' });

  const { limits, usage } = await getTenantUsageAndLimits(req.tenant.id);
  if (usage.contacts >= limits.maxContacts) {
    return res.status(403).json({ error: 'Quota maximum de contacts atteint' });
  }

  const norm = normalizePhoneAndTags(phone, tags);
  const [c] = await q(
    'INSERT INTO contacts(tenant_id, name, phone, email, tags, notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.tenant.id, name.trim(), norm.cleanPhone, email.trim(), norm.tags, notes]
  );
  res.status(201).json(c);
}));

