import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, PLAN_PRESETS, generateApiKey, generateApiSecret, generateClientId } from '../db.js';
import { auth, requireSuperAdmin, logAudit } from '../middleware/security.js';
import {
  CHANNELS,
  creditTenantAccount,
  getGlobalAccountingSummary,
  getTenantAccounting
} from '../core/accountingService.js';
import { getCentralChannelsStatus, toggleChannelGlobal } from '../core/channelRegistry.js';

const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    const status = e.statusCode || 500;
    if (status >= 500) console.error('[ADMIN_ERR]', e);
    res.status(status).json({ error: e.message });
  });

export const adminCentralRouter = Router();
adminCentralRouter.use(auth, requireSuperAdmin);

/**
 * GET /api/admin/overview
 * Vue consolidée pour le C-Panel : comptabilité globale, 4 backends canaux, alertes de soldes bas
 */
adminCentralRouter.get('/overview', wrap(async (req, res) => {
  const [accounting, channelsStatus, pendingRecharges] = await Promise.all([
    getGlobalAccountingSummary(),
    getCentralChannelsStatus(),
    q(`
      SELECT rr.*, t.name AS tenant_name
      FROM recharge_requests rr
      LEFT JOIN tenants t ON t.id = rr.tenant_id
      WHERE rr.status = 'pending'
      ORDER BY rr.created_at DESC
    `)
  ]);

  res.json({
    ...accounting,
    channelsStatus,
    pendingRechargesCount: pendingRecharges.length,
    pendingRecharges
  });
}));

/**
 * GET /api/admin/accounting/summary & /ledger
 */
adminCentralRouter.get('/accounting/summary', wrap(async (req, res) => {
  const summary = await getGlobalAccountingSummary();
  res.json(summary);
}));

adminCentralRouter.get('/accounting/ledger', wrap(async (req, res) => {
  const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
  const channel = req.query.channel && req.query.channel !== 'all' ? String(req.query.channel) : null;
  const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 150));

  const entries = await q(
    `SELECT ae.*, t.name AS tenant_name
     FROM accounting_entries ae
     LEFT JOIN tenants t ON t.id = ae.tenant_id
     WHERE ($1::int IS NULL OR ae.tenant_id = $1)
       AND ($2::text IS NULL OR ae.channel = $2)
     ORDER BY ae.created_at DESC
     LIMIT $3`,
    [tenantId, channel, limit]
  );

  res.json({ count: entries.length, entries });
}));

/**
 * POST /api/admin/clients/:id/credit
 * Crédite un client en USD et/ou en packs de messages (SMS, WhatsApp, RCS, Email)
 */
adminCentralRouter.post('/clients/:id/credit', wrap(async (req, res) => {
  const tid = Number(req.params.id);
  const {
    amountUsd = 0,
    packs = {},
    paymentMethod = 'C-Panel Admin',
    reference = '',
    note = ''
  } = req.body;

  const result = await creditTenantAccount({
    tenantId: tid,
    actorEmail: req.user.email,
    amountUsd,
    packs,
    paymentMethod,
    reference,
    note
  });

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_CREDIT_ACCOUNT',
    details: { amountUsd: result.addedUsd, packs: result.addedPacks, paymentMethod, reference: result.reference },
    req
  });

  res.json(result);
}));

/**
 * POST /api/admin/clients/:id/credentials/rotate
 * Régénère les credentials API (api_key / api_secret / client_id) et/ou réinitialise le mot de passe client
 */
adminCentralRouter.post('/clients/:id/credentials/rotate', wrap(async (req, res) => {
  const tid = Number(req.params.id);
  const { rotateApiKey = true, rotateApiSecret = false, newPassword = '' } = req.body;

  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });

  const nextClientId = t.client_id || generateClientId();
  const nextApiKey = rotateApiKey ? generateApiKey() : t.api_key || generateApiKey();
  let plainSecret = null;
  let nextSecretHash = t.api_secret_hash || null;

  if (rotateApiSecret) {
    plainSecret = generateApiSecret();
    nextSecretHash = await bcrypt.hash(plainSecret, 10);
  }

  await q('UPDATE tenants SET client_id=$1, api_key=$2, api_secret_hash=$3 WHERE id=$4', [
    nextClientId,
    nextApiKey,
    nextSecretHash,
    tid
  ]);

  let passwordReset = false;
  if (newPassword && String(newPassword).length >= 8) {
    const hash = await bcrypt.hash(String(newPassword), 10);
    await q("UPDATE users SET password_hash=$1 WHERE tenant_id=$2 AND role != 'superadmin'", [hash, tid]);
    passwordReset = true;
  }

  const [u] = await q("SELECT email FROM users WHERE tenant_id=$1 AND role != 'superadmin' ORDER BY id ASC LIMIT 1", [
    tid
  ]);

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_ROTATE_CREDENTIALS',
    details: { rotateApiKey, rotateApiSecret, passwordReset },
    req
  });

  res.json({
    ok: true,
    credentials: {
      company: t.name,
      loginEmail: u?.email || '',
      clientId: nextClientId,
      apiKey: nextApiKey,
      apiSecret: plainSecret,
      passwordReset,
      newPassword: passwordReset ? String(newPassword) : null
    }
  });
}));

/**
 * PATCH /api/admin/clients/:id/channels
 * Active ou désactive individuellement SMS, WhatsApp, RCS, Email pour un client
 */
adminCentralRouter.patch('/clients/:id/channels', wrap(async (req, res) => {
  const tid = Number(req.params.id);
  const { allowedChannels } = req.body;
  if (!Array.isArray(allowedChannels)) {
    return res.status(400).json({ error: 'Fournissez allowedChannels (tableau de canaux)' });
  }

  const clean = allowedChannels.filter(c => CHANNELS.includes(c));
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });

  const preset = PLAN_PRESETS[t.plan] || PLAN_PRESETS.business;
  const nextLimits = { ...preset, ...(t.limits || {}), allowedChannels: clean };

  await q('UPDATE tenants SET limits=$1 WHERE id=$2', [JSON.stringify(nextLimits), tid]);

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_UPDATE_CLIENT_CHANNELS',
    details: { company: t.name, allowedChannels: clean },
    req
  });

  const acct = await getTenantAccounting(tid);
  res.json({ ok: true, allowedChannels: clean, accounting: acct });
}));

/**
 * GET /api/admin/channels/status & PUT /api/admin/channels/:channel/toggle
 * Supervision & interrupteur global des 4 backends canaux depuis le C-Panel
 */
adminCentralRouter.get('/channels/status', wrap(async (req, res) => {
  const channels = await getCentralChannelsStatus();
  res.json({ channels });
}));

adminCentralRouter.put('/channels/:channel/toggle', wrap(async (req, res) => {
  const ch = String(req.params.channel || '').toLowerCase();
  const { enabled = true, maintenanceNote = '' } = req.body;
  const updated = await toggleChannelGlobal(ch, { enabled, maintenanceNote });

  await logAudit({
    tenantId: req.user.tid,
    actorEmail: req.user.email,
    action: 'ADMIN_TOGGLE_CHANNEL_BACKEND',
    details: { channel: ch, enabled: updated.enabled, maintenanceNote: updated.maintenanceNote },
    req
  });

  const channels = await getCentralChannelsStatus();
  res.json({ ok: true, channel: ch, config: updated, channels });
}));
