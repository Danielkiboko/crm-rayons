import { Router } from 'express';
import { q } from '../db.js';
import { auth, requireClientOnly, logAudit } from '../middleware/security.js';
import { getTenantAccounting } from '../core/accountingService.js';
import { assertChannelEnabled, getCentralChannelsStatus } from '../core/channelRegistry.js';

const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    const status = e.statusCode || 500;
    if (status >= 500) console.error(`[CHANNEL_ERR]`, e);
    res.status(status).json({ error: e.message });
  });

/**
 * Crée le routeur Express dédié à un backend canal (SMS, WhatsApp, RCS ou Email)
 * Toutes les routes sont protégées par `requireClientOnly` (le C-Panel ne peut jamais envoyer).
 */
export function createChannelRouter(channel, service) {
  const router = Router();
  router.use(auth, requireClientOnly);

  // GET /api/channels/<channel>/overview — Solde restant, statut global/client, KPIs, modèles & derniers messages
  router.get('/overview', wrap(async (req, res) => {
    const tid = req.user.tid;
    const acct = await getTenantAccounting(tid);
    const allStatus = await getCentralChannelsStatus();
    const globalChannel = allStatus.find(c => c.channel === channel) || { enabled: true, maintenanceNote: '' };
    const allowed = (acct.limits.allowedChannels || []).includes(channel);

    const [stats] = await q(
      `SELECT
         count(*) FILTER (WHERE direction='out')::int AS total_sent,
         count(*) FILTER (WHERE direction='out' AND status='delivered')::int AS delivered,
         count(*) FILTER (WHERE direction='out' AND status='failed')::int AS failed,
         count(*) FILTER (WHERE direction='out' AND status='queued')::int AS queued,
         count(*) FILTER (WHERE direction='in')::int AS inbound,
         COALESCE(sum(cost), 0)::float AS total_cost
       FROM messages
       WHERE tenant_id=$1 AND channel=$2`,
      [tid, channel]
    );

    const recentMessages = await q(
      `SELECT m.*, c.name AS contact_name
       FROM messages m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.tenant_id=$1 AND m.channel=$2
       ORDER BY m.created_at DESC
       LIMIT 25`,
      [tid, channel]
    );

    const campaigns = await q(
      `SELECT * FROM campaigns
       WHERE tenant_id=$1 AND channel=$2
       ORDER BY created_at DESC
       LIMIT 15`,
      [tid, channel]
    );

    const templates = await q(
      `SELECT * FROM templates
       WHERE tenant_id=$1 AND channel=$2
       ORDER BY id DESC`,
      [tid, channel]
    );

    const extra = service.getExtraOverview ? await service.getExtraOverview(tid) : {};

    res.json({
      channel,
      enabledGlobal: globalChannel.enabled !== false,
      maintenanceNote: globalChannel.maintenanceNote || '',
      enabledForClient: allowed,
      active: globalChannel.enabled !== false && allowed && acct.tenant.status !== 'suspended',
      quota: acct.quotas[channel],
      financial: acct.financial,
      senderId: acct.tenant.sender_id,
      stats: stats || { total_sent: 0, delivered: 0, failed: 0, queued: 0, inbound: 0, total_cost: 0 },
      recentMessages,
      campaigns,
      templates,
      ...extra
    });
  }));

  // POST /api/channels/<channel>/send — Envoi unitaire sur ce backend canal
  router.post('/send', wrap(async (req, res) => {
    await assertChannelEnabled(req.user.tid, channel);
    const result = await service.sendSingle({
      tenantId: req.user.tid,
      userEmail: req.user.email,
      payload: req.body,
      req
    });

    await logAudit({
      tenantId: req.user.tid,
      actorEmail: req.user.email,
      action: `CHANNEL_${channel.toUpperCase()}_SEND`,
      details: { ok: result.ok, txRef: result.txRef || null, to: result.to || req.body.to || null },
      req
    });

    const acct = await getTenantAccounting(req.user.tid);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      remainingQuota: acct.quotas[channel],
      financial: acct.financial
    });
  }));

  // POST /api/channels/<channel>/campaign — Campagne de masse dédiée à ce backend canal
  router.post('/campaign', wrap(async (req, res) => {
    await assertChannelEnabled(req.user.tid, channel);
    const result = await service.launchCampaign({
      tenantId: req.user.tid,
      userEmail: req.user.email,
      payload: req.body,
      req
    });

    await logAudit({
      tenantId: req.user.tid,
      actorEmail: req.user.email,
      action: `CHANNEL_${channel.toUpperCase()}_CAMPAIGN`,
      details: { campaignId: result.campaign?.id, total: result.total, succeeded: result.succeeded },
      req
    });

    const acct = await getTenantAccounting(req.user.tid);
    res.json({
      ...result,
      remainingQuota: acct.quotas[channel],
      financial: acct.financial
    });
  }));

  // GET /api/channels/<channel>/history — Historique dédié au canal
  router.get('/history', wrap(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const rows = await q(
      `SELECT m.*, c.name AS contact_name
       FROM messages m
       LEFT JOIN contacts c ON c.id = m.contact_id
       WHERE m.tenant_id=$1 AND m.channel=$2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [req.user.tid, channel, limit]
    );
    res.json(rows);
  }));

  // GET /api/channels/<channel>/templates — Modèles du canal
  router.get('/templates', wrap(async (req, res) => {
    const rows = await q(
      'SELECT * FROM templates WHERE tenant_id=$1 AND channel=$2 ORDER BY id DESC',
      [req.user.tid, channel]
    );
    res.json(rows);
  }));

  return router;
}
