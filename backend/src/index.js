import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { q, PLAN_PRESETS, generateApiKey, dbEngineType } from './db.js';
import {
  senders,
  detectTelecomOperator,
  testTelecomRoute,
  resolveSmtpConfig,
  testEmailConnection
} from './providers/index.js';
import {
  signToken,
  securityAndTelemetryHeaders,
  createRateLimiter,
  auth,
  requireSuperAdmin,
  logAudit
} from './middleware/security.js';
import {
  getMasterSettings,
  getTenantUsageAndLimits,
  normalizePhoneAndTags,
  processDlrEvent,
  inbound,
  sendOne,
  executeMessageDispatch,
  startQueueWorker,
  queueWorkerStats
} from './services/messagingService.js';
import { publicApiV1Router } from './routes/publicApiV1.js';

const app = express();
app.use(cors());
app.use(securityAndTelemetryHeaders);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

const wrap = fn => (req, res) =>
  fn(req, res).catch(e => {
    console.error(`[${req.requestId || 'ERR'}]`, e);
    res.status(500).json({ error: e.message, requestId: req.requestId });
  });

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'auth' });
const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 300, keyPrefix: 'webhook' });

/* ============================================================================
 * 1. HEALTHCHECK & ÉTAT SYSTÈME (/api/health)
 * ========================================================================== */
app.get('/api/health', wrap(async (req, res) => {
  const start = Date.now();
  const [counts] = await q(`
    SELECT
      (SELECT count(*)::int FROM tenants) AS tenants,
      (SELECT count(*)::int FROM contacts) AS contacts,
      (SELECT count(*)::int FROM messages) AS messages,
      (SELECT count(*)::int FROM messages WHERE status='queued' AND scheduled_at IS NOT NULL) AS scheduled_queue,
      (SELECT count(*)::int FROM recharge_requests WHERE status='pending') AS pending_recharges
  `);
  const masterSettings = await getMasterSettings();
  const telecom = masterSettings.telecom || {};

  res.json({
    status: 'ok',
    service: 'Rayons CRM SaaS Engine',
    version: '2.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      engine: dbEngineType,
      pingMs: Date.now() - start,
      counts
    },
    queueWorker: queueWorkerStats,
    gateways: {
      vodacom: { protocol: telecom.vodacom?.protocol || 'http_json', mode: telecom.vodacom?.mode || 'sandbox_dlr' },
      airtel: { protocol: telecom.airtel?.protocol || 'http_json', mode: telecom.airtel?.mode || 'sandbox_dlr' },
      orange: { protocol: telecom.orange?.protocol || 'orange_sdp', mode: telecom.orange?.mode || 'sandbox_dlr' },
      africell: { protocol: telecom.africell?.protocol || 'http_get', mode: telecom.africell?.mode || 'sandbox_dlr' }
    }
  });
}));

/* ============================================================================
 * 2. AUTHENTIFICATION (/api/auth/*)
 * ========================================================================== */
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { company, email, password } = req.body;
  if (!company || !email || (password || '').length < 8) {
    return res.status(400).json({ error: 'Champs invalides (mot de passe : 8+ caractères)' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const exists = await q('SELECT id FROM users WHERE email=$1', [cleanEmail]);
  if (exists.length > 0) {
    return res.status(400).json({ error: 'Cette adresse email est déjà enregistrée' });
  }

  const senderId = company.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11) || 'RAYONS';
  const [t] = await q(
    'INSERT INTO tenants(name, plan, status, sender_id, api_key, limits) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [company, 'starter', 'active', senderId, generateApiKey(), JSON.stringify(PLAN_PRESETS.starter)]
  );
  const [u] = await q(
    'INSERT INTO users(tenant_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING *',
    [t.id, cleanEmail, await bcrypt.hash(password, 10), 'client']
  );

  await logAudit({
    tenantId: t.id,
    actorEmail: cleanEmail,
    action: 'CLIENT_REGISTER',
    details: { company, plan: 'starter', senderId },
    req
  });

  res.json({ token: signToken(u), email: u.email, role: u.role, company });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const cleanEmail = (req.body.email || '').trim().toLowerCase();
  const [u] = await q('SELECT * FROM users WHERE email=$1', [cleanEmail]);
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password_hash))) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const [t] = await q('SELECT name, status FROM tenants WHERE id=$1', [u.tenant_id]);
  if (t?.status === 'suspended' && u.role !== 'superadmin') {
    return res.status(403).json({
      error: 'Votre compte client est suspendu. Contactez l’administrateur Rayons CRM.'
    });
  }

  await logAudit({
    tenantId: u.tenant_id,
    actorEmail: u.email,
    action: u.role === 'superadmin' ? 'CPANEL_LOGIN' : 'CLIENT_LOGIN',
    details: { company: t?.name },
    req
  });

  res.json({ token: signToken(u), email: u.email, role: u.role, company: t?.name || 'Rayons CRM' });
}));

/* ============================================================================
 * 3. ESPACE CLIENT : PROFIL, QUOTAS, DEMANDES DE RECHARGE & LISTE NOIRE (/api/me/*)
 * ========================================================================== */
app.get('/api/me/usage', auth, wrap(async (req, res) => {
  const [u] = await q('SELECT id, email, role, tenant_id FROM users WHERE id=$1', [req.user.uid]);
  const info = await getTenantUsageAndLimits(req.user.tid);
  const creditLogs = await q(
    'SELECT * FROM credit_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.tid]
  );
  const rechargeRequests = await q(
    'SELECT * FROM recharge_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30',
    [req.user.tid]
  );
  const blacklist = await q(
    'SELECT * FROM blacklist WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
    [req.user.tid]
  );
  const [inboxStats] = await q(
    `SELECT
       count(*) FILTER (WHERE direction='in' AND is_read=false)::int AS unread_count,
       (SELECT count(*)::int FROM auto_reply_rules WHERE tenant_id=$1 AND is_active=true) AS active_rules
     FROM messages WHERE tenant_id=$1`,
    [req.user.tid]
  );

  res.json({
    user: u || { id: req.user.uid, email: req.user.email, role: req.user.role },
    plan: info.tenant.plan,
    status: info.tenant.status,
    senderId: info.tenant.sender_id,
    apiKey: info.tenant.api_key,
    company: info.tenant.name,
    limits: info.limits,
    usage: info.usage,
    unreadInboxCount: inboxStats?.unread_count || 0,
    activeAutoRepliesCount: inboxStats?.active_rules || 0,
    creditLogs,
    rechargeRequests,
    blacklist,
    presets: PLAN_PRESETS
  });
}));

app.post('/api/me/regenerate-key', auth, wrap(async (req, res) => {
  const nextKey = generateApiKey();
  await q('UPDATE tenants SET api_key=$1 WHERE id=$2', [nextKey, req.user.tid]);
  await logAudit({
    tenantId: req.user.tid,
    actorEmail: req.user.email,
    action: 'API_KEY_REGENERATED',
    req
  });
  res.json({ apiKey: nextKey });
}));

// Soumettre une demande de recharge Mobile Money / Virement depuis l'Espace Client vers le C-Panel
app.post('/api/me/recharge-requests', auth, wrap(async (req, res) => {
  const { amountUsd, paymentMethod = 'M-Pesa Vodacom', payerPhone = '', reference = '', note = '' } = req.body;
  const amt = Number(amountUsd);
  if (!amt || amt <= 0 || !reference.trim()) {
    return res.status(400).json({ error: 'Montant USD et référence de paiement Mobile Money / Banque requis' });
  }
  const [reqRow] = await q(
    `INSERT INTO recharge_requests(tenant_id, amount_usd, payment_method, payer_phone, reference, note, status)
     VALUES($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [req.user.tid, amt, paymentMethod, payerPhone.trim(), reference.trim(), note.trim()]
  );
  await logAudit({
    tenantId: req.user.tid,
    actorEmail: req.user.email,
    action: 'RECHARGE_REQUEST_SUBMITTED',
    details: { amountUsd: amt, paymentMethod, reference },
    req
  });
  res.status(201).json(reqRow);
}));

// Gestion de la liste noire (Opt-Out / STOP SMS) du client
app.get('/api/me/blacklist', auth, wrap(async (req, res) => {
  res.json(await q('SELECT * FROM blacklist WHERE tenant_id=$1 ORDER BY created_at DESC', [req.user.tid]));
}));

app.post('/api/me/blacklist', auth, wrap(async (req, res) => {
  const { addr, reason = 'Ajout manuel Espace Client' } = req.body;
  if (!addr) return res.status(400).json({ error: 'Numéro ou email requis' });
  const [row] = await q(
    `INSERT INTO blacklist(tenant_id, addr, reason)
     VALUES($1, $2, $3)
     ON CONFLICT (tenant_id, addr) DO UPDATE SET reason = EXCLUDED.reason
     RETURNING *`,
    [req.user.tid, addr.trim(), reason]
  );
  res.status(201).json(row);
}));

app.delete('/api/me/blacklist/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM blacklist WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* ============================================================================
 * 4. C-PANEL SUPER-ADMIN : CLIENTS, QUOTAS, FACTURATION & VALIDATION (/api/admin/*)
 * ========================================================================== */
app.get('/api/admin/clients', auth, requireSuperAdmin, wrap(async (req, res) => {
  const rows = await q(`
    SELECT
      t.id,
      t.name,
      t.plan,
      t.status,
      t.sender_id,
      t.api_key,
      t.limits,
      t.created_at,
      (SELECT u.email FROM users u WHERE u.tenant_id = t.id ORDER BY u.id ASC LIMIT 1) AS email,
      (SELECT u.role FROM users u WHERE u.tenant_id = t.id ORDER BY u.id ASC LIMIT 1) AS role,
      (SELECT count(*)::int FROM contacts c WHERE c.tenant_id = t.id) AS used_contacts,
      (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id AND m.channel='sms' AND m.direction='out') AS used_sms,
      (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id AND m.channel='whatsapp' AND m.direction='out') AS used_whatsapp,
      (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id AND m.channel='rcs' AND m.direction='out') AS used_rcs,
      (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id AND m.channel='email' AND m.direction='out') AS used_email,
      (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id) AS total_tx,
      (SELECT COALESCE(sum(m.cost), 0)::float FROM messages m WHERE m.tenant_id = t.id) AS used_spend,
      (SELECT COALESCE(sum(m.buy_cost), 0)::float FROM messages m WHERE m.tenant_id = t.id) AS used_buy_cost
    FROM tenants t
    ORDER BY t.id ASC
  `);

  const creditLogs = await q(`
    SELECT cl.*, t.name AS tenant_name
    FROM credit_logs cl
    LEFT JOIN tenants t ON t.id = cl.tenant_id
    ORDER BY cl.created_at DESC
    LIMIT 100
  `);

  const rechargeRequests = await q(`
    SELECT rr.*, t.name AS tenant_name, t.sender_id AS tenant_sender
    FROM recharge_requests rr
    LEFT JOIN tenants t ON t.id = rr.tenant_id
    ORDER BY CASE WHEN rr.status='pending' THEN 0 ELSE 1 END, rr.created_at DESC
    LIMIT 100
  `);

  const formatted = rows.map(r => {
    const preset = PLAN_PRESETS[r.plan] || PLAN_PRESETS.business;
    return {
      ...r,
      limits: { ...preset, ...(r.limits || {}) }
    };
  });
  res.json({ clients: formatted, presets: PLAN_PRESETS, creditLogs, rechargeRequests });
}));

app.post('/api/admin/impersonate/:id', auth, requireSuperAdmin, wrap(async (req, res) => {
  const tid = +req.params.id;
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });
  const [u] = await q('SELECT * FROM users WHERE tenant_id=$1 ORDER BY id ASC LIMIT 1', [tid]);
  if (!u) return res.status(404).json({ error: 'Aucun utilisateur rattaché à ce client' });

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_IMPERSONATE_CLIENT',
    details: { targetCompany: t.name, targetEmail: u.email },
    req
  });

  res.json({
    token: signToken({ id: u.id, tenant_id: t.id, email: u.email, role: 'client' }),
    email: u.email,
    role: 'client',
    company: t.name
  });
}));

// Créditer directement un compte client depuis le C-Panel
app.post('/api/admin/clients/:id/recharge', auth, requireSuperAdmin, wrap(async (req, res) => {
  const tid = +req.params.id;
  const { amountUsd, paymentMethod = 'M-Pesa Vodacom', reference = '', note = '' } = req.body;
  const amt = Number(amountUsd);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Montant invalide' });

  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });

  const preset = PLAN_PRESETS[t.plan] || PLAN_PRESETS.business;
  const curLimits = { ...preset, ...(t.limits || {}) };
  const nextSpendLimit = Number((Number(curLimits.maxSpendUsd || 0) + amt).toFixed(2));
  const nextLimits = { ...curLimits, maxSpendUsd: nextSpendLimit };

  await q('UPDATE tenants SET limits=$1, status=$2 WHERE id=$3', [
    JSON.stringify(nextLimits),
    'active',
    tid
  ]);

  const [log] = await q(
    `INSERT INTO credit_logs(tenant_id, amount_usd, payment_method, reference, note)
     VALUES($1, $2, $3, $4, $5) RETURNING *`,
    [tid, amt, paymentMethod, reference || `REC-${Date.now().toString().slice(-6)}`, note || 'Rechargement C-Panel']
  );

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_RECHARGE_CLIENT',
    details: { company: t.name, amountUsd: amt, newMaxSpendUsd: nextSpendLimit, paymentMethod },
    req
  });

  res.json({ ok: true, newMaxSpendUsd: nextSpendLimit, log });
}));

// Approuver ou rejeter en 1 clic une demande de recharge Mobile Money soumise par un client
app.post('/api/admin/recharge-requests/:id/review', auth, requireSuperAdmin, wrap(async (req, res) => {
  const reqId = +req.params.id;
  const { decision = 'approved' } = req.body; // 'approved' | 'rejected'
  const [rr] = await q('SELECT * FROM recharge_requests WHERE id=$1', [reqId]);
  if (!rr) return res.status(404).json({ error: 'Demande de rechargement introuvable' });
  if (rr.status !== 'pending') {
    return res.status(400).json({ error: 'Cette demande a déjà été traitée' });
  }

  if (decision === 'rejected') {
    await q("UPDATE recharge_requests SET status='rejected', reviewed_at=now() WHERE id=$1", [reqId]);
    return res.json({ ok: true, status: 'rejected' });
  }

  // Approbation : créditer immédiatement le plafond USD du client et journaliser dans credit_logs
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [rr.tenant_id]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });

  const preset = PLAN_PRESETS[t.plan] || PLAN_PRESETS.business;
  const curLimits = { ...preset, ...(t.limits || {}) };
  const amt = Number(rr.amount_usd);
  const nextSpendLimit = Number((Number(curLimits.maxSpendUsd || 0) + amt).toFixed(2));
  const nextLimits = { ...curLimits, maxSpendUsd: nextSpendLimit };

  await q('UPDATE tenants SET limits=$1, status=$2 WHERE id=$3', [
    JSON.stringify(nextLimits),
    'active',
    t.id
  ]);

  await q("UPDATE recharge_requests SET status='approved', reviewed_at=now() WHERE id=$1", [reqId]);

  await q(
    `INSERT INTO credit_logs(tenant_id, amount_usd, payment_method, reference, note)
     VALUES($1, $2, $3, $4, $5)`,
    [t.id, amt, rr.payment_method, rr.reference, rr.note || 'Demande Mobile Money approuvée']
  );

  await logAudit({
    tenantId: t.id,
    actorEmail: req.user.email,
    action: 'ADMIN_APPROVE_RECHARGE_REQUEST',
    details: { requestId: reqId, amountUsd: amt, reference: rr.reference },
    req
  });

  res.json({ ok: true, status: 'approved', newMaxSpendUsd: nextSpendLimit });
}));

app.post('/api/admin/clients', auth, requireSuperAdmin, wrap(async (req, res) => {
  const { company, email, password, plan = 'starter', senderId, limits } = req.body;
  if (!company || !email || (password || '').length < 8) {
    return res.status(400).json({ error: 'Entreprise, email et mot de passe (8+ caractères) requis' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const exists = await q('SELECT id FROM users WHERE email=$1', [cleanEmail]);
  if (exists.length > 0) {
    return res.status(400).json({ error: 'Cette adresse email est déjà utilisée par un autre client' });
  }

  const basePreset = PLAN_PRESETS[plan] || PLAN_PRESETS.starter;
  const finalLimits = { ...basePreset, ...(limits || {}) };
  const cleanSender =
    (senderId || company).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11) || 'RAYONS';

  const [t] = await q(
    'INSERT INTO tenants(name, plan, status, sender_id, api_key, limits, settings) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [company, plan, 'active', cleanSender, generateApiKey(), JSON.stringify(finalLimits), JSON.stringify({})]
  );
  const [u] = await q(
    'INSERT INTO users(tenant_id, email, password_hash, role) VALUES($1, $2, $3, $4) RETURNING id, email, role',
    [t.id, cleanEmail, await bcrypt.hash(password, 10), 'client']
  );

  await q(
    `INSERT INTO credit_logs(tenant_id, amount_usd, payment_method, reference, note)
     VALUES($1, $2, 'Activation C-Panel', $3, $4)`,
    [t.id, finalLimits.maxSpendUsd || 25, `INIT-${1000 + t.id}`, `Ouverture forfait ${plan}`]
  );

  await logAudit({
    tenantId: t.id,
    actorEmail: req.user.email,
    action: 'ADMIN_CREATE_CLIENT',
    details: { company, email: cleanEmail, plan, senderId: cleanSender },
    req
  });

  res.json({ tenant: t, user: u });
}));

app.put('/api/admin/clients/:id', auth, requireSuperAdmin, wrap(async (req, res) => {
  const tid = +req.params.id;
  const { name, plan, status, senderId, limits, newPassword, email } = req.body;
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tid]);
  if (!t) return res.status(404).json({ error: 'Client introuvable' });

  const nextPlan = plan || t.plan;
  const basePreset = PLAN_PRESETS[nextPlan] || PLAN_PRESETS.business;
  const nextLimits = limits ? { ...basePreset, ...limits } : { ...basePreset, ...(t.limits || {}) };

  await q(
    'UPDATE tenants SET name=$1, plan=$2, status=$3, sender_id=$4, limits=$5 WHERE id=$6',
    [
      name || t.name,
      nextPlan,
      status || t.status,
      (senderId || t.sender_id || 'RAYONS').toUpperCase().slice(0, 11),
      JSON.stringify(nextLimits),
      tid
    ]
  );

  if (email) {
    await q('UPDATE users SET email=$1 WHERE tenant_id=$2 AND role != $3', [
      email.trim().toLowerCase(),
      tid,
      'superadmin'
    ]);
  }
  if (newPassword && newPassword.length >= 8) {
    const hash = await bcrypt.hash(newPassword, 10);
    await q('UPDATE users SET password_hash=$1 WHERE tenant_id=$2', [hash, tid]);
  }

  await logAudit({
    tenantId: tid,
    actorEmail: req.user.email,
    action: 'ADMIN_UPDATE_CLIENT',
    details: { name: name || t.name, plan: nextPlan, status: status || t.status },
    req
  });

  res.json({ ok: true });
}));

app.delete('/api/admin/clients/:id', auth, requireSuperAdmin, wrap(async (req, res) => {
  const tid = +req.params.id;
  if (tid === req.user.tid) {
    return res.status(400).json({ error: 'Impossible de supprimer le compte Master Super-Admin' });
  }
  await q('DELETE FROM tenants WHERE id=$1', [tid]);
  await logAudit({
    tenantId: null,
    actorEmail: req.user.email,
    action: 'ADMIN_DELETE_CLIENT',
    details: { deletedTenantId: tid },
    req
  });
  res.json({ ok: true });
}));

app.get('/api/admin/audit-logs', auth, requireSuperAdmin, wrap(async (req, res) => {
  const rows = await q(`
    SELECT a.*, t.name AS tenant_name
    FROM audit_logs a
    LEFT JOIN tenants t ON t.id = a.tenant_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
}));

/* ---------- C-Panel : Diagnostic des Passerelles Télécoms & Journal Webhooks DLR/MO ---------- */
app.post('/api/admin/routes/test', auth, requireSuperAdmin, wrap(async (req, res) => {
  const { operator = 'vodacom', settingsOverride } = req.body;
  const masterSettings = settingsOverride || (await getMasterSettings());
  const opLabels = {
    vodacom: 'Vodacom RDC',
    airtel: 'Airtel RDC',
    orange: 'Orange RDC',
    africell: 'Africell RDC'
  };
  try {
    const out = await testTelecomRoute(masterSettings, operator);
    await q(
      `INSERT INTO webhook_logs(tenant_id, operator, event_type, status, dlr_code, latency_ms, raw_payload)
       VALUES($1, $2, 'route_test', 'ok', $3, $4, $5)`,
      [
        req.user.tid,
        opLabels[operator] || operator,
        `${out.protocol.toUpperCase()} (${out.mode})`,
        out.latencyMs || 0,
        JSON.stringify(out)
      ]
    );
    res.json(out);
  } catch (e) {
    await q(
      `INSERT INTO webhook_logs(tenant_id, operator, event_type, status, dlr_code, latency_ms, raw_payload)
       VALUES($1, $2, 'route_test', 'failed', 'CONN_ERR', 0, $3)`,
      [req.user.tid, opLabels[operator] || operator, JSON.stringify({ error: e.message })]
    );
    res.status(400).json({ error: e.message });
  }
}));

app.get('/api/admin/webhooks', auth, requireSuperAdmin, wrap(async (req, res) => {
  const logs = await q(`
    SELECT w.*, t.name AS tenant_name
    FROM webhook_logs w
    LEFT JOIN tenants t ON t.id = w.tenant_id
    ORDER BY w.created_at DESC
    LIMIT 100
  `);
  res.json(logs);
}));

app.post('/api/admin/webhooks/simulate-dlr', auth, requireSuperAdmin, wrap(async (req, res) => {
  const { txRef, status = 'DELIVRD', errCode = '000' } = req.body;
  let targetTx = txRef;
  if (!targetTx) {
    const [latest] = await q(
      "SELECT tx_ref, provider_id, operator FROM messages WHERE direction='out' ORDER BY id DESC LIMIT 1"
    );
    if (!latest) return res.status(404).json({ error: 'Aucune transaction sortante à mettre à jour' });
    targetTx = latest.tx_ref;
  }
  const out = await processDlrEvent({
    txRef: targetTx,
    rawStatus: status,
    rawErr: errCode,
    rawPayload: {
      simulatedFrom: 'C-Panel DLR Simulator',
      txRef: targetTx,
      stat: status,
      err: errCode,
      timestamp: new Date().toISOString()
    }
  });
  res.json(out);
}));

app.post('/api/admin/webhooks/simulate-mo', auth, requireSuperAdmin, wrap(async (req, res) => {
  const {
    from = '+243814500111',
    toSenderId = 'KIVUTECH',
    text = 'Bonjour, je confirme ma commande. Merci !',
    channel = 'sms'
  } = req.body;
  const cleanSender = String(toSenderId || '').trim().toUpperCase();
  let [t] = await q('SELECT * FROM tenants WHERE upper(sender_id)=$1 ORDER BY id ASC LIMIT 1', [cleanSender]);
  if (!t) {
    [t] = await q("SELECT * FROM tenants WHERE name != 'Rayons CRM (Master)' ORDER BY id ASC LIMIT 1");
  }
  if (!t) {
    [t] = await q('SELECT * FROM tenants ORDER BY id ASC LIMIT 1');
  }
  const op = detectTelecomOperator(from).label;
  const msg = await inbound(t.id, channel, from, text, `mo-${Date.now()}`, op);
  res.json({ ok: true, tenant: t.name, message: msg });
}));

/* ============================================================================
 * 5. RÉGLAGES, MODÈLES, CONTACTS & CAMPAGNES (/api/settings, /api/templates, /api/contacts, /api/campaigns)
 * ========================================================================== */
app.get('/api/settings', auth, wrap(async (req, res) => {
  const [t] = await q('SELECT name, plan, status, sender_id, api_key, limits, settings FROM tenants WHERE id=$1', [req.user.tid]);
  const [u] = await q('SELECT email, role FROM users WHERE id=$1', [req.user.uid]);
  const isSuper = (u?.role || req.user.role) === 'superadmin';
  const masterSettings = await getMasterSettings();
  const userEmail = u?.email || req.user.email || 'admin@rayons.cd';
  const emailDirect = t?.settings?.emailDirect || masterSettings.emailDirect || {};
  const smtpResolved = resolveSmtpConfig(userEmail, emailDirect);

  res.json({
    ...t,
    settings: isSuper
      ? masterSettings
      : {
          emailDirect,
          rcs: t?.settings?.rcs || masterSettings.rcs || {},
          clientWebhookUrl: t?.settings?.clientWebhookUrl || ''
        },
    smtpResolved: {
      accountEmail: smtpResolved.accountEmail,
      providerLabel: smtpResolved.providerLabel,
      host: smtpResolved.host,
      port: smtpResolved.port,
      secure: smtpResolved.secure,
      hasPassword: smtpResolved.hasPassword,
      fromName: smtpResolved.fromName || t?.name || 'Rayons CRM',
      replyTo: smtpResolved.replyTo
    },
    userEmail,
    role: u?.role || req.user.role || 'client',
    webhookBase: `${process.env.PUBLIC_URL || 'http://localhost:4000'}/webhooks`,
    tenantId: req.user.tid
  });
}));

app.put('/api/settings', auth, wrap(async (req, res) => {
  const [u] = await q('SELECT role FROM users WHERE id=$1', [req.user.uid]);
  const isSuper = (u?.role || req.user.role) === 'superadmin';

  if (isSuper) {
    await q('UPDATE tenants SET settings=$1 WHERE id=$2', [req.body.settings || {}, req.user.tid]);
    await logAudit({
      tenantId: req.user.tid,
      actorEmail: req.user.email,
      action: 'MASTER_ROUTES_UPDATED',
      req
    });
  } else {
    const [t] = await q('SELECT settings FROM tenants WHERE id=$1', [req.user.tid]);
    const nextSettings = {
      ...(t?.settings || {}),
      emailDirect: req.body.settings?.emailDirect || t?.settings?.emailDirect || {},
      rcs: req.body.settings?.rcs || t?.settings?.rcs || {},
      clientWebhookUrl: req.body.settings?.clientWebhookUrl ?? t?.settings?.clientWebhookUrl ?? ''
    };
    await q('UPDATE tenants SET settings=$1 WHERE id=$2', [nextSettings, req.user.tid]);
    await logAudit({
      tenantId: req.user.tid,
      actorEmail: req.user.email,
      action: 'CLIENT_SETTINGS_UPDATED',
      req
    });
  }
  res.json({ ok: true });
}));

// Tester la connexion Email Directe (SMTP / Relais) et envoyer un email de vérification
app.post('/api/email/test-connection', auth, wrap(async (req, res) => {
  const { emailDirectOverride, testRecipient = '', sendTestMail = false } = req.body;
  const [t] = await q('SELECT name, settings FROM tenants WHERE id=$1', [req.user.tid]);
  const [u] = await q('SELECT email FROM users WHERE id=$1', [req.user.uid]);
  const userEmail = u?.email || req.user.email || 'admin@rayons.cd';
  const masterSettings = await getMasterSettings();

  const effectiveCfg = {
    ...masterSettings,
    emailDirect: emailDirectOverride || t?.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  try {
    const out = await testEmailConnection(effectiveCfg, {
      userEmail,
      companyName: t?.name || 'Rayons CRM',
      testRecipient: testRecipient.trim() || userEmail,
      sendTestMail: Boolean(sendTestMail)
    });
    await q(
      `INSERT INTO webhook_logs(tenant_id, operator, event_type, status, dlr_code, latency_ms, raw_payload)
       VALUES($1, $2, 'email_test', 'ok', $3, $4, $5)`,
      [
        req.user.tid,
        `Email Direct (${userEmail})`,
        out.mode === 'live_smtp' ? 'SMTP_AUTH_OK' : 'RELAY_READY',
        out.latencyMs || 24,
        JSON.stringify(out)
      ]
    );
    res.json(out);
  } catch (e) {
    await q(
      `INSERT INTO webhook_logs(tenant_id, operator, event_type, status, dlr_code, latency_ms, raw_payload)
       VALUES($1, $2, 'email_test', 'failed', 'SMTP_ERR', 0, $3)`,
      [req.user.tid, `Email Direct (${userEmail})`, JSON.stringify({ error: e.message })]
    );
    res.status(400).json({ error: `Échec connexion SMTP (${userEmail}) : ${e.message}` });
  }
}));

/* ---------- Générateur de Bannières Animées ("Images qui bougent") pour Emailing & RCS ---------- */
app.get('/api/media/animated/:slug', (req, res) => {
  const slug = String(req.params.slug || '').replace(/\.(svg|gif)$/i, '');
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const themes = {
    'pulse-promo': {
      bg1: '#0f172a',
      bg2: '#1d4ed8',
      accent: '#38bdf8',
      badge: 'OFFRE FLASH ENTREPRISE',
      title: 'Avantage Prioritaire & Tarifs Préférentiels',
      sub: 'Activation immédiate • Kinshasa • Lubumbashi • Goma'
    },
    'live-payment': {
      bg1: '#064e3b',
      bg2: '#059669',
      accent: '#34d399',
      badge: 'CONFIRMATION MOBILE MONEY & FACTURATION',
      title: 'Transaction Validée en Temps Réel',
      sub: 'M-Pesa Vodacom • Airtel Money • Orange Money • Rawbank'
    },
    'delivery-radar': {
      bg1: '#1e1b4b',
      bg2: '#4338ca',
      accent: '#a5b4fc',
      badge: 'SUIVI LOGISTIQUE & EXPÉDITION RDC',
      title: 'Votre Commande est en Mouvement',
      sub: 'Traçabilité en direct • Notification automatique à la livraison'
    },
    'vip-event': {
      bg1: '#18181b',
      bg2: '#7e22ce',
      accent: '#d8b4fe',
      badge: 'INVITATION PRIVILÈGE PARTENAIRE',
      title: 'Rencontre Business & Lancement Exclusif',
      sub: 'Accès réservé aux comptes certifiés Rayons CRM'
    },
    'newsletter-wave': {
      bg1: '#0f172a',
      bg2: '#0369a1',
      accent: '#7dd3fc',
      badge: 'BULLETIN MENSUEL & INNOVATIONS',
      title: 'Vos Nouveautés & Indicateurs du Mois',
      sub: 'Communication directe multi-opérateurs • +243 RDC'
    }
  };

  const t = themes[slug] || themes['pulse-promo'];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.bg1}">
        <animate attributeName="stop-color" values="${t.bg1};${t.bg2};${t.bg1}" dur="7s" repeatCount="indefinite" />
      </stop>
      <stop offset="100%" stop-color="${t.bg2}">
        <animate attributeName="stop-color" values="${t.bg2};${t.bg1};${t.bg2}" dur="7s" repeatCount="indefinite" />
      </stop>
    </linearGradient>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.15" />
      <stop offset="50%" stop-color="${t.accent}" stop-opacity="0.95" />
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0.15" />
    </linearGradient>
  </defs>

  <rect width="600" height="220" fill="url(#bgGrad)" />

  <!-- Cercles radar animés en arrière-plan -->
  <circle cx="510" cy="110" r="30" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-opacity="0.5">
    <animate attributeName="r" values="20;115" dur="3.2s" repeatCount="indefinite" />
    <animate attributeName="stroke-opacity" values="0.7;0" dur="3.2s" repeatCount="indefinite" />
  </circle>
  <circle cx="510" cy="110" r="30" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-opacity="0.5">
    <animate attributeName="r" values="20;115" dur="3.2s" begin="1.6s" repeatCount="indefinite" />
    <animate attributeName="stroke-opacity" values="0.7;0" dur="3.2s" begin="1.6s" repeatCount="indefinite" />
  </circle>

  <!-- Point lumineux central pulsant -->
  <circle cx="510" cy="110" r="10" fill="${t.accent}">
    <animate attributeName="r" values="8;13;8" dur="1.6s" repeatCount="indefinite" />
  </circle>

  <!-- Barres de signal télécom / flux en mouvement -->
  <g transform="translate(455, 145)">
    <rect x="0" y="18" width="10" height="22" rx="3" fill="${t.accent}" opacity="0.85">
      <animate attributeName="height" values="12;32;12" dur="1.4s" repeatCount="indefinite" />
      <animate attributeName="y" values="28;8;28" dur="1.4s" repeatCount="indefinite" />
    </rect>
    <rect x="16" y="10" width="10" height="30" rx="3" fill="${t.accent}" opacity="0.9">
      <animate attributeName="height" values="28;14;28" dur="1.1s" repeatCount="indefinite" />
      <animate attributeName="y" values="12;26;12" dur="1.1s" repeatCount="indefinite" />
    </rect>
    <rect x="32" y="4" width="10" height="36" rx="3" fill="${t.accent}">
      <animate attributeName="height" values="16;38;16" dur="1.5s" repeatCount="indefinite" />
      <animate attributeName="y" values="24;2;24" dur="1.5s" repeatCount="indefinite" />
    </rect>
    <rect x="48" y="12" width="10" height="28" rx="3" fill="${t.accent}" opacity="0.85">
      <animate attributeName="height" values="34;12;34" dur="1.25s" repeatCount="indefinite" />
      <animate attributeName="y" values="6;28;6" dur="1.25s" repeatCount="indefinite" />
    </rect>
  </g>

  <!-- Onde lumineuse horizontale en déplacement continu -->
  <rect x="-200" y="196" width="220" height="4" rx="2" fill="url(#barGrad)">
    <animate attributeName="x" values="-220;620" dur="2.8s" repeatCount="indefinite" />
  </rect>

  <!-- Contenu typographique -->
  <rect x="34" y="34" width="250" height="24" rx="12" fill="#ffffff" fill-opacity="0.14" />
  <circle cx="48" cy="46" r="4" fill="${t.accent}">
    <animate attributeName="opacity" values="1;0.2;1" dur="1.1s" repeatCount="indefinite" />
  </circle>
  <text x="60" y="50" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'Inter',sans-serif" font-size="10.5" font-weight="700" letter-spacing="0.06em">${t.badge}</text>

  <text x="34" y="102" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'Inter',sans-serif" font-size="22" font-weight="700" letter-spacing="-0.02em">${t.title}</text>
  <text x="34" y="132" fill="#e2e8f0" font-family="-apple-system,BlinkMacSystemFont,'Inter',sans-serif" font-size="13.5" font-weight="400">${t.sub}</text>

  <!-- Indicateur de progression animé -->
  <rect x="34" y="156" width="280" height="6" rx="3" fill="#ffffff" fill-opacity="0.16" />
  <rect x="34" y="156" width="180" height="6" rx="3" fill="${t.accent}">
    <animate attributeName="width" values="60;260;60" dur="4s" repeatCount="indefinite" />
  </rect>
</svg>`;

  res.send(svg);
});

const DEFAULT_GALLERY_TEMPLATES = [
  {
    name: 'Email Animé — Offre Flash Entreprise',
    channel: 'email',
    subject: 'Offre Prioritaire Entreprise — {{company}}',
    body: 'Bonjour {{name}},\n\nProfitez dès aujourd’hui de notre offre prioritaire dédiée aux entreprises opérant à Kinshasa, Lubumbashi et Goma.\n\nVotre compte bénéficie d’un accompagnement dédié et d’une tarification préférentielle sur l’ensemble de vos opérations.',
    metadata: {
      badgeText: 'OFFRE FLASH ANIMÉE',
      cardTitle: 'Activez votre avantage entreprise dès maintenant',
      mediaUrl: 'http://localhost:4000/api/media/animated/pulse-promo.svg',
      ctaLabel: 'Activer mon offre maintenant',
      ctaUrl: 'https://rayons.cd/offres',
      accentColor: '#1d4ed8',
      isAnimated: true
    }
  },
  {
    name: 'Email Animé — Confirmation Mobile Money & Facture',
    channel: 'email',
    subject: 'Confirmation de paiement & Facture — {{company}}',
    body: 'Bonjour {{name}},\n\nNous vous confirmons la bonne réception de votre règlement Mobile Money / Banque. Votre solde et votre facture acquittée sont immédiatement disponibles dans votre espace client.\n\nMerci pour votre confiance renouvelée.',
    metadata: {
      badgeText: 'PAIEMENT VALIDÉ',
      cardTitle: 'Votre transaction a été créditée avec succès',
      mediaUrl: 'http://localhost:4000/api/media/animated/live-payment.svg',
      ctaLabel: 'Télécharger mon reçu officiel',
      ctaUrl: 'https://rayons.cd/factures',
      accentColor: '#059669',
      isAnimated: true
    }
  },
  {
    name: 'Email Animé — Suivi de Livraison & Expédition',
    channel: 'email',
    subject: 'Votre commande est en route — {{company}}',
    body: 'Bonjour {{name}},\n\nVotre expédition vient de quitter notre centre logistique et est actuellement en cours d’acheminement vers votre adresse.\n\nVous pouvez suivre la progression en direct ou contacter notre équipe en un clic.',
    metadata: {
      badgeText: 'EN COURS DE LIVRAISON',
      cardTitle: 'Suivi en temps réel de votre expédition',
      mediaUrl: 'http://localhost:4000/api/media/animated/delivery-radar.svg',
      ctaLabel: 'Suivre mon colis en direct',
      ctaUrl: 'https://rayons.cd/suivi',
      accentColor: '#4338ca',
      isAnimated: true
    }
  },
  {
    name: 'Email Animé — Invitation VIP & Événement',
    channel: 'email',
    subject: 'Invitation Privilège Partenaire — {{company}}',
    body: 'Bonjour {{name}},\n\nNous avons l’honneur de vous convier à notre prochaine session privée consacrée aux nouvelles solutions digitales et télécoms en République Démocratique du Congo.\n\nRéservez votre place dès maintenant.',
    metadata: {
      badgeText: 'INVITATION VIP',
      cardTitle: 'Rencontre Partenaires & Démonstration Live',
      mediaUrl: 'http://localhost:4000/api/media/animated/vip-event.svg',
      ctaLabel: 'Confirmer ma participation',
      ctaUrl: 'https://rayons.cd/evenements',
      accentColor: '#7e22ce',
      isAnimated: true
    }
  },
  {
    name: 'Carte Riche RCS Animée — Promotion Interactive',
    channel: 'rcs',
    subject: 'Promotion Interactive RCS',
    body: 'Bonjour {{name}}, découvrez notre nouvelle offre enrichie avec visuel animé et réponse rapide en 1 clic.',
    metadata: {
      cardTitle: 'Offre Interactive Entreprise RDC',
      mediaUrl: 'http://localhost:4000/api/media/animated/pulse-promo.svg',
      ctaLabel: 'Découvrir l’offre',
      ctaUrl: 'https://rayons.cd/offres',
      ctaPhone: '+243810000000',
      quickReplies: 'Confirmer,Être rappelé,Tarifs',
      smsFallback: true,
      isAnimated: true
    }
  }
];

app.get('/api/templates', auth, wrap(async (req, res) => {
  res.json(await q('SELECT * FROM templates WHERE tenant_id=$1 ORDER BY id DESC', [req.user.tid]));
}));

app.post('/api/templates', auth, wrap(async (req, res) => {
  const { name, channel = 'sms', subject = '', body, metadata = {} } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'Nom et contenu requis' });
  const [tpl] = await q(
    'INSERT INTO templates(tenant_id, name, channel, subject, body, metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.tid, name.trim(), channel, subject, body, JSON.stringify(metadata || {})]
  );
  res.json(tpl);
}));

app.put('/api/templates/:id', auth, wrap(async (req, res) => {
  const { name, channel = 'sms', subject = '', body, metadata = {} } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'Nom et contenu requis' });
  const [tpl] = await q(
    `UPDATE templates
     SET name=$1, channel=$2, subject=$3, body=$4, metadata=$5
     WHERE id=$6 AND tenant_id=$7
     RETURNING *`,
    [name.trim(), channel, subject, body, JSON.stringify(metadata || {}), req.params.id, req.user.tid]
  );
  if (!tpl) return res.status(404).json({ error: 'Modèle introuvable' });
  res.json(tpl);
}));

app.post('/api/templates/seed-gallery', auth, wrap(async (req, res) => {
  const existing = await q('SELECT name FROM templates WHERE tenant_id=$1', [req.user.tid]);
  const existingNames = new Set(existing.map(x => x.name.toLowerCase()));
  let added = 0;
  for (const item of DEFAULT_GALLERY_TEMPLATES) {
    if (existingNames.has(item.name.toLowerCase())) continue;
    await q(
      'INSERT INTO templates(tenant_id, name, channel, subject, body, metadata) VALUES($1,$2,$3,$4,$5,$6)',
      [req.user.tid, item.name, item.channel, item.subject, item.body, JSON.stringify(item.metadata)]
    );
    added++;
  }
  const all = await q('SELECT * FROM templates WHERE tenant_id=$1 ORDER BY id DESC', [req.user.tid]);
  res.json({ ok: true, added, templates: all });
}));

app.delete('/api/templates/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM templates WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

app.get('/api/contacts', auth, wrap(async (req, res) => {
  const s = `%${req.query.search || ''}%`;
  res.json(
    await q(
      `SELECT * FROM contacts WHERE tenant_id=$1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
       ORDER BY created_at DESC LIMIT 1000`,
      [req.user.tid, s]
    )
  );
}));

app.post('/api/contacts', auth, wrap(async (req, res) => {
  const { name, phone, email, tags = [], notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  const { tenant, limits, usage } = await getTenantUsageAndLimits(req.user.tid);
  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Compte suspendu par l’administrateur' });
  }
  if (usage.contacts >= limits.maxContacts) {
    return res.status(403).json({
      error: `Limite de contacts atteinte (${usage.contacts}/${limits.maxContacts} max pour votre forfait ${tenant.plan.toUpperCase()}). Contactez l'administrateur Rayons CRM.`
    });
  }

  const norm = normalizePhoneAndTags(phone, tags);
  const [c] = await q(
    'INSERT INTO contacts(tenant_id,name,phone,email,tags,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.tid, name.trim(), norm.cleanPhone, (email || '').trim(), norm.tags, notes]
  );
  res.json(c);
}));

app.post('/api/contacts/import', auth, wrap(async (req, res) => {
  const { contacts: rows = [] } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Aucun contact valide trouvé dans le fichier.' });
  }

  const { tenant, limits, usage } = await getTenantUsageAndLimits(req.user.tid);
  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Compte suspendu par l’administrateur.' });
  }

  const existing = await q('SELECT id, phone, email, tags FROM contacts WHERE tenant_id=$1', [req.user.tid]);
  const byDigits = new Map();
  const byEmail = new Map();
  for (const ex of existing) {
    const d = (ex.phone || '').replace(/\D/g, '');
    if (d) byDigits.set(d, ex);
    if (ex.email) byEmail.set(ex.email.toLowerCase(), ex);
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let currentTotal = usage.contacts;

  for (const item of rows) {
    const name = (item.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    const email = (item.email || '').trim();
    const norm = normalizePhoneAndTags(item.phone, item.tags);
    const digits = norm.cleanPhone.replace(/\D/g, '');

    const match = (digits && byDigits.get(digits)) || (email && byEmail.get(email.toLowerCase()));
    if (match) {
      const mergedTags = Array.from(new Set([...(match.tags || []), ...norm.tags]));
      await q(
        "UPDATE contacts SET name=$1, phone=COALESCE(NULLIF($2,''), phone), email=COALESCE(NULLIF($3,''), email), tags=$4 WHERE id=$5 AND tenant_id=$6",
        [name, norm.cleanPhone, email, mergedTags, match.id, req.user.tid]
      );
      updated++;
      continue;
    }

    if (currentTotal >= limits.maxContacts) {
      skipped++;
      continue;
    }

    const [inserted] = await q(
      'INSERT INTO contacts(tenant_id,name,phone,email,tags,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, phone, email, tags',
      [req.user.tid, name, norm.cleanPhone, email, norm.tags, item.notes || 'Import CSV']
    );
    if (digits) byDigits.set(digits, inserted);
    if (email) byEmail.set(email.toLowerCase(), inserted);
    imported++;
    currentTotal++;
  }

  res.json({ imported, updated, skipped, totalContacts: currentTotal, maxContacts: limits.maxContacts });
}));

app.put('/api/contacts/:id', auth, wrap(async (req, res) => {
  const { name, phone, email, tags = [], notes } = req.body;
  const [c] = await q(
    'UPDATE contacts SET name=$1,phone=$2,email=$3,tags=$4,notes=$5 WHERE id=$6 AND tenant_id=$7 RETURNING *',
    [name, phone, email, tags, notes, req.params.id, req.user.tid]
  );
  c ? res.json(c) : res.status(404).json({ error: 'Introuvable' });
}));

app.delete('/api/contacts/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM contacts WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* ---------- Campagnes Groupées, Envoi en Masse & Programmation (/api/campaigns) ---------- */
app.get('/api/campaigns', auth, wrap(async (req, res) => {
  const rows = await q(
    'SELECT * FROM campaigns WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',
    [req.user.tid]
  );
  res.json(rows);
}));

app.delete('/api/campaigns/:id', auth, wrap(async (req, res) => {
  const cid = +req.params.id;
  await q("DELETE FROM messages WHERE campaign_id=$1 AND tenant_id=$2 AND status='queued'", [cid, req.user.tid]);
  await q('DELETE FROM campaigns WHERE id=$1 AND tenant_id=$2', [cid, req.user.tid]);
  res.json({ ok: true });
}));

// Moteur d'Envoi en Masse (SMS, Emailing, RCS Rich Card, WhatsApp)
app.post('/api/campaigns/launch', auth, wrap(async (req, res) => {
  const {
    name = '',
    channel = 'sms',
    audienceMode = 'all', // 'all' | 'operator' | 'tag' | 'manual_list' | 'selected'
    targetOperator = '',
    targetTag = '',
    manualRecipientsText = '',
    contactIds = [],
    subject = '',
    body = '',
    metadata = {},
    scheduledAt = null
  } = req.body;

  if (!senders[channel]) return res.status(400).json({ error: 'Canal inconnu' });
  if (!body.trim()) return res.status(400).json({ error: 'Contenu du message requis' });

  const { tenant, limits, usage } = await getTenantUsageAndLimits(req.user.tid);
  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Votre compte client est suspendu par l’administrateur.' });
  }

  const allowed = limits.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];
  if (!allowed.includes(channel)) {
    return res.status(403).json({
      error: `Le canal ${channel.toUpperCase()} n'est pas inclus dans votre forfait (${tenant.plan.toUpperCase()}).`
    });
  }

  const [u] = await q('SELECT email FROM users WHERE id=$1', [req.user.uid]);
  const userEmail = u?.email || req.user.email || 'admin@rayons.cd';
  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    rcs: { ...(masterSettings.rcs || {}), ...(tenant.settings?.rcs || {}) },
    emailDirect: tenant.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  // 1. Résolution de l'audience selon le mode choisi (Contacts sélectionnés + Liste manuelle optionnelle)
  let targetContacts = [];
  if (Array.isArray(contactIds) && contactIds.length > 0) {
    const selectedFromDb = await q(
      'SELECT * FROM contacts WHERE tenant_id=$1 AND id = ANY($2::int[]) ORDER BY id ASC',
      [req.user.tid, contactIds]
    );
    targetContacts.push(...selectedFromDb);
  }

  const rawManualItems = String(manualRecipientsText || '')
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (rawManualItems.length > 0) {
    const existing = await q('SELECT * FROM contacts WHERE tenant_id=$1', [req.user.tid]);
    const byDigits = new Map();
    const byEmail = new Map();
    for (const ex of existing) {
      const d = (ex.phone || '').replace(/\D/g, '');
      if (d) byDigits.set(d, ex);
      if (ex.email) byEmail.set(ex.email.toLowerCase(), ex);
    }

    const seenKeys = new Set();
    for (const raw of rawManualItems) {
      let labelName = '';
      let addrPart = raw;
      if (raw.includes(':')) {
        const parts = raw.split(':');
        labelName = parts[0].trim();
        addrPart = parts.slice(1).join(':').trim();
      }

      if (channel === 'email' || addrPart.includes('@')) {
        const cleanMail = addrPart.replace(/[<>]/g, '').trim().toLowerCase();
        if (!cleanMail.includes('@') || seenKeys.has(cleanMail)) continue;
        seenKeys.add(cleanMail);

        let c = byEmail.get(cleanMail);
        if (!c) {
          const guessedName = labelName || cleanMail.split('@')[0];
          [c] = await q(
            'INSERT INTO contacts(tenant_id, name, email, tags) VALUES($1,$2,$3,$4) RETURNING *',
            [req.user.tid, guessedName, cleanMail, ['Envoi Masse']]
          );
          byEmail.set(cleanMail, c);
        }
        targetContacts.push(c);
      } else {
        const norm = normalizePhoneAndTags(addrPart, ['Envoi Masse']);
        const digits = norm.cleanPhone.replace(/\D/g, '');
        if (digits.length < 8 || seenKeys.has(digits)) continue;
        seenKeys.add(digits);

        let c = byDigits.get(digits);
        if (!c) {
          const guessedName = labelName || norm.cleanPhone;
          [c] = await q(
            'INSERT INTO contacts(tenant_id, name, phone, tags) VALUES($1,$2,$3,$4) RETURNING *',
            [req.user.tid, guessedName, norm.cleanPhone, norm.tags]
          );
          byDigits.set(digits, c);
        }
        targetContacts.push(c);
      }
    }
  } else if (targetContacts.length === 0 && audienceMode !== 'selected' && audienceMode !== 'manual_list') {
    const allContacts = await q('SELECT * FROM contacts WHERE tenant_id=$1 ORDER BY id ASC', [req.user.tid]);
    targetContacts = allContacts.filter(c => {
      const hasAddr = channel === 'email' ? Boolean(c.email) : Boolean(c.phone);
      if (!hasAddr) return false;
      if (audienceMode === 'operator' && targetOperator) {
        const opLabel = detectTelecomOperator(c.phone || '').label;
        return opLabel === targetOperator;
      }
      if (audienceMode === 'tag' && targetTag) {
        return Array.isArray(c.tags) && c.tags.includes(targetTag);
      }
      return true;
    });
  }

  // Filtrer les contacts qui ont bien l'adresse requise pour le canal choisi et dédoublonner
  const uniqueContacts = [];
  const seenAddr = new Set();
  for (const c of targetContacts) {
    const addrKey = channel === 'email' ? (c.email || '').toLowerCase().trim() : (c.phone || '').replace(/\D/g, '');
    if (!addrKey || seenAddr.has(addrKey)) continue;
    seenAddr.add(addrKey);
    uniqueContacts.push(c);
  }

  if (uniqueContacts.length === 0) {
    return res.status(400).json({
      error: `Aucun destinataire valide trouvé avec une adresse ${channel === 'email' ? 'email' : 'téléphonique'} pour cette sélection.`
    });
  }

  // 2. Vérification des quotas & budget
  const quotaMap = {
    sms: { used: usage.sms, max: limits.maxSms, label: 'SMS Télécom' },
    whatsapp: { used: usage.whatsapp, max: limits.maxWhatsapp, label: 'WhatsApp' },
    rcs: { used: usage.rcs, max: limits.maxRcs, label: 'RCS Opérateur' },
    email: { used: usage.email, max: limits.maxEmails, label: 'Emails directs' }
  };
  const qCheck = quotaMap[channel];
  if (qCheck && qCheck.used + uniqueContacts.length > qCheck.max) {
    return res.status(403).json({
      error: `Quota insuffisant pour ${qCheck.label} (${qCheck.used}/${qCheck.max} utilisés, besoin de ${uniqueContacts.length}).`
    });
  }
  if (channel !== 'email' && usage.spendUsd >= limits.maxSpendUsd) {
    return res.status(403).json({
      error: `Plafond de budget télécom atteint ($${usage.spendUsd.toFixed(2)} / $${limits.maxSpendUsd}).`
    });
  }

  const isFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;
  const finalCampaignName =
    name.trim() || `Campagne ${channel.toUpperCase()} — ${new Date().toLocaleDateString('fr-FR')} (${uniqueContacts.length} dest.)`;

  const [camp] = await q(
    `INSERT INTO campaigns(tenant_id, name, channel, subject, body, status, scheduled_at, total_recipients, metadata)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      req.user.tid,
      finalCampaignName,
      channel,
      subject || null,
      body,
      isFuture ? 'scheduled' : 'completed',
      isFuture ? new Date(scheduledAt).toISOString() : null,
      uniqueContacts.length,
      JSON.stringify({ ...metadata, audienceMode, targetOperator, targetTag })
    ]
  );

  const results = [];
  for (const c of uniqueContacts) {
    const personalBody = String(body)
      .replaceAll('{{name}}', c.name || 'Client')
      .replaceAll('{{phone}}', c.phone || '')
      .replaceAll('{{email}}', c.email || '')
      .replaceAll('{{company}}', tenant.name || 'Rayons CRM');
    const personalSubject = String(subject || '')
      .replaceAll('{{name}}', c.name || 'Client')
      .replaceAll('{{company}}', tenant.name || 'Rayons CRM');

    results.push(
      await sendOne(req.user.tid, effectiveCfg, channel, c, {
        subject: personalSubject,
        body: personalBody,
        metadata,
        userEmail,
        companyName: tenant.name,
        customSenderId: tenant.sender_id || 'RAYONS',
        campaignId: camp.id,
        scheduledAt
      })
    );
  }

  await logAudit({
    tenantId: req.user.tid,
    actorEmail: userEmail,
    action: 'MASS_CAMPAIGN_LAUNCHED',
    details: {
      campaignId: camp.id,
      name: finalCampaignName,
      channel,
      recipients: uniqueContacts.length,
      scheduled: isFuture
    },
    req
  });

  res.json({
    ok: true,
    campaignId: camp.id,
    campaignName: finalCampaignName,
    totalRecipients: uniqueContacts.length,
    sent: results.filter(r => r.ok && !r.scheduled).length,
    scheduled: results.filter(r => r.scheduled).length,
    failed: results.filter(r => !r.ok),
    senderEmail: userEmail,
    results
  });
}));

/* ============================================================================
 * 6. ENVOI DE MESSAGES, CAMPAGNES PROGRAMMÉES & RELANCE (/api/messages/*)
 * ========================================================================== */
app.post('/api/messages/send', auth, wrap(async (req, res) => {
  const {
    channel,
    contactIds = [],
    subject,
    body,
    template,
    metadata = {},
    campaignName = '',
    scheduledAt = null
  } = req.body;

  if (!senders[channel]) return res.status(400).json({ error: 'Canal inconnu' });
  if (!body && !template) return res.status(400).json({ error: 'Message vide' });

  const { tenant, limits, usage } = await getTenantUsageAndLimits(req.user.tid);
  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Votre compte client est suspendu par l’administrateur.' });
  }

  const allowed = limits.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];
  if (!allowed.includes(channel)) {
    return res.status(403).json({
      error: `Le canal ${channel.toUpperCase()} n'est pas inclus dans votre forfait (${tenant.plan.toUpperCase()}). Contactez l'administrateur.`
    });
  }

  const quotaMap = {
    sms: { used: usage.sms, max: limits.maxSms, label: 'SMS Télécom' },
    whatsapp: { used: usage.whatsapp, max: limits.maxWhatsapp, label: 'WhatsApp' },
    rcs: { used: usage.rcs, max: limits.maxRcs, label: 'RCS Opérateur' },
    email: { used: usage.email, max: limits.maxEmails, label: 'Emails directs' }
  };
  const qCheck = quotaMap[channel];
  if (qCheck && qCheck.used + contactIds.length > qCheck.max) {
    return res.status(403).json({
      error: `Limite d'utilisation atteinte pour ${qCheck.label} (${qCheck.used}/${qCheck.max} utilisés). Contactez l'administrateur Rayons CRM.`
    });
  }

  if (channel !== 'email' && usage.spendUsd >= limits.maxSpendUsd) {
    return res.status(403).json({
      error: `Plafond de budget télécom atteint ($${usage.spendUsd.toFixed(2)} / $${limits.maxSpendUsd}). Contactez l'administrateur Rayons CRM.`
    });
  }

  const [u] = await q('SELECT email FROM users WHERE id=$1', [req.user.uid]);
  const userEmail = u?.email || req.user.email || 'admin@rayons.cd';

  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    rcs: { ...(masterSettings.rcs || {}), ...(tenant.settings?.rcs || {}) },
    emailDirect: tenant.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  const contacts = await q(
    'SELECT * FROM contacts WHERE tenant_id=$1 AND id = ANY($2::int[])',
    [req.user.tid, contactIds]
  );

  let campaignId = null;
  if (contacts.length > 1 || scheduledAt || campaignName) {
    const isFuture = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 5000;
    const [camp] = await q(
      `INSERT INTO campaigns(tenant_id, name, channel, subject, body, status, scheduled_at, total_recipients, metadata)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        req.user.tid,
        campaignName.trim() || `Campagne ${channel.toUpperCase()} (${contacts.length} dest.)`,
        channel,
        subject || null,
        body || '',
        isFuture ? 'scheduled' : 'completed',
        isFuture ? new Date(scheduledAt).toISOString() : null,
        contacts.length,
        JSON.stringify(metadata || {})
      ]
    );
    campaignId = camp.id;
  }

  const results = [];
  for (const c of contacts) {
    const personal = (body || '')
      .replaceAll('{{name}}', c.name || 'Client')
      .replaceAll('{{phone}}', c.phone || '')
      .replaceAll('{{email}}', c.email || '')
      .replaceAll('{{company}}', tenant.name || 'Rayons CRM');
    const personalSubj = (subject || '')
      .replaceAll('{{name}}', c.name || 'Client')
      .replaceAll('{{company}}', tenant.name || 'Rayons CRM');

    results.push(
      await sendOne(req.user.tid, effectiveCfg, channel, c, {
        subject: personalSubj,
        body: personal,
        template,
        metadata,
        userEmail,
        companyName: tenant.name,
        customSenderId: tenant.sender_id || 'RAYONS',
        campaignId,
        scheduledAt
      })
    );
  }

  res.json({
    sent: results.filter(r => r.ok && !r.scheduled).length,
    scheduled: results.filter(r => r.scheduled).length,
    failed: results.filter(r => !r.ok),
    campaignId,
    senderEmail: userEmail,
    results
  });
}));

// Relancer manuellement une transaction en échec (Retry)
app.post('/api/messages/:id/retry', auth, wrap(async (req, res) => {
  const msgId = +req.params.id;
  const [m] = await q('SELECT * FROM messages WHERE id=$1 AND tenant_id=$2', [msgId, req.user.tid]);
  if (!m) return res.status(404).json({ error: 'Transaction introuvable' });

  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [req.user.tid]);
  const [u] = await q('SELECT email FROM users WHERE id=$1', [req.user.uid]);
  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    emailDirect: t?.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  const out = await executeMessageDispatch(m.id, effectiveCfg, {
    userEmail: u?.email || req.user.email,
    companyName: t?.name,
    customSenderId: t?.sender_id || 'RAYONS'
  });

  res.json(out);
}));

/* ============================================================================
 * 6b. BOÎTE DE RÉCEPTION UNIFIÉE (CONVERSATIONS 2-WAY) & AUTO-RÉPONDEUR
 * ========================================================================== */
app.get('/api/inbox/threads', auth, wrap(async (req, res) => {
  const tid = req.user.tid;
  const rows = await q(
    `SELECT
       c.id AS contact_id,
       c.name,
       c.phone,
       c.email,
       c.tags,
       c.notes,
       COALESCE(agg.total_messages, 0)::int AS total_messages,
       COALESCE(agg.inbound_count, 0)::int AS inbound_count,
       COALESCE(agg.outbound_count, 0)::int AS outbound_count,
       COALESCE(agg.unread_count, 0)::int AS unread_count,
       lm.id AS last_message_id,
       lm.channel AS last_channel,
       lm.direction AS last_direction,
       lm.subject AS last_subject,
       lm.body AS last_body,
       lm.status AS last_status,
       lm.operator AS last_operator,
       lm.metadata AS last_metadata,
       lm.created_at AS last_created_at
     FROM contacts c
     LEFT JOIN (
       SELECT
         contact_id,
         count(*)::int AS total_messages,
         count(*) FILTER (WHERE direction='in')::int AS inbound_count,
         count(*) FILTER (WHERE direction='out')::int AS outbound_count,
         count(*) FILTER (WHERE direction='in' AND is_read=false)::int AS unread_count
       FROM messages
       WHERE tenant_id=$1
       GROUP BY contact_id
     ) agg ON agg.contact_id = c.id
     LEFT JOIN LATERAL (
       SELECT id, channel, direction, subject, body, status, operator, metadata, created_at
       FROM messages
       WHERE tenant_id=$1 AND contact_id = c.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) lm ON true
     WHERE c.tenant_id=$1
     ORDER BY
       CASE WHEN COALESCE(agg.unread_count, 0) > 0 THEN 0 ELSE 1 END ASC,
       lm.created_at DESC NULLS LAST,
       c.id DESC`,
    [tid]
  );

  const blacklistRows = await q('SELECT addr FROM blacklist WHERE tenant_id=$1', [tid]);
  const blSet = new Set(
    blacklistRows.map(b => String(b.addr || '').replace(/\D/g, '') || String(b.addr || '').toLowerCase())
  );

  const enriched = rows.map(r => {
    const phoneDigits = String(r.phone || '').replace(/\D/g, '');
    const emailLower = String(r.email || '').toLowerCase();
    const isBlacklisted =
      (phoneDigits.length >= 8 && blSet.has(phoneDigits)) ||
      (emailLower && blSet.has(emailLower));
    return {
      ...r,
      operatorLabel: detectTelecomOperator(r.phone || '').label,
      isBlacklisted
    };
  });

  res.json(enriched);
}));

app.get('/api/inbox/threads/:contactId', auth, wrap(async (req, res) => {
  const tid = req.user.tid;
  const cid = +req.params.contactId;

  const [contact] = await q('SELECT * FROM contacts WHERE id=$1 AND tenant_id=$2', [cid, tid]);
  if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

  // Marquer tous les messages entrants de cette conversation comme lus
  await q(
    "UPDATE messages SET is_read=true WHERE tenant_id=$1 AND contact_id=$2 AND direction='in' AND is_read=false",
    [tid, cid]
  );

  const messages = await q(
    `SELECT * FROM messages
     WHERE tenant_id=$1 AND contact_id=$2
     ORDER BY created_at ASC, id ASC`,
    [tid, cid]
  );

  res.json({
    contact: {
      ...contact,
      operatorLabel: detectTelecomOperator(contact.phone || '').label
    },
    messages
  });
}));

app.post('/api/inbox/threads/:contactId/reply', auth, wrap(async (req, res) => {
  const tid = req.user.tid;
  const cid = +req.params.contactId;
  const { channel = 'sms', subject = '', body = '', metadata = {} } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Le message de réponse ne peut pas être vide' });
  }

  const [contact] = await q('SELECT * FROM contacts WHERE id=$1 AND tenant_id=$2', [cid, tid]);
  if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

  const { tenant, limits, usage } = await getTenantUsageAndLimits(tid);
  if (tenant.status === 'suspended') {
    return res.status(403).json({ error: 'Compte suspendu.' });
  }
  if (!(limits.allowedChannels || []).includes(channel)) {
    return res.status(403).json({ error: `Le canal ${channel.toUpperCase()} n'est pas activé sur votre forfait.` });
  }

  const [u] = await q('SELECT email FROM users WHERE id=$1', [req.user.uid]);
  const userEmail = u?.email || req.user.email || 'contact@rayons.cd';
  const masterSettings = await getMasterSettings();
  const effectiveCfg = {
    ...masterSettings,
    emailDirect: tenant.settings?.emailDirect || masterSettings.emailDirect || {}
  };

  const personalBody = String(body)
    .replaceAll('{{name}}', contact.name || 'Client')
    .replaceAll('{{phone}}', contact.phone || '')
    .replaceAll('{{email}}', contact.email || '')
    .replaceAll('{{company}}', tenant.name || 'Rayons CRM');

  const personalSubj = String(subject || `Message de ${tenant.name || 'Rayons CRM'}`)
    .replaceAll('{{name}}', contact.name || 'Client')
    .replaceAll('{{company}}', tenant.name || 'Rayons CRM');

  const out = await sendOne(tid, effectiveCfg, channel, contact, {
    subject: personalSubj,
    body: personalBody,
    metadata,
    userEmail,
    companyName: tenant.name,
    customSenderId: tenant.sender_id || 'RAYONS'
  });

  res.json(out);
}));

// Simulateur de message entrant 2-Way (pour tester la réception SMS/WhatsApp/RCS et l'Auto-répondeur en direct)
app.post('/api/inbox/simulate-inbound', auth, wrap(async (req, res) => {
  const tid = req.user.tid;
  const { contactId, from = '', channel = 'sms', body = '', subject = '' } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Veuillez saisir le contenu du message entrant à simuler' });
  }

  let senderAddr = String(from || '').trim();
  if (contactId) {
    const [c] = await q('SELECT * FROM contacts WHERE id=$1 AND tenant_id=$2', [+contactId, tid]);
    if (c) {
      senderAddr = channel === 'email' ? (c.email || 'client@exemple.cd') : (c.phone || '+243812345678');
    }
  }
  if (!senderAddr) {
    senderAddr = channel === 'email' ? 'prospect@entreprise.cd' : '+243 81 900 1234';
  }

  const saved = await inbound(
    tid,
    channel,
    senderAddr,
    body,
    `sim-mo-${Date.now()}`,
    undefined,
    subject || null
  );

  res.json(saved);
}));

// CRUD Auto-répondeur par mots-clés (/api/auto-replies)
app.get('/api/auto-replies', auth, wrap(async (req, res) => {
  const rows = await q(
    'SELECT * FROM auto_reply_rules WHERE tenant_id=$1 ORDER BY id ASC',
    [req.user.tid]
  );
  res.json(rows);
}));

app.post('/api/auto-replies', auth, wrap(async (req, res) => {
  const {
    name,
    keyword,
    match_type = 'contains',
    channel = 'all',
    reply_channel = 'same',
    reply_subject = '',
    reply_body,
    reply_metadata = {},
    add_tag = '',
    is_active = true
  } = req.body;

  if (!name || !reply_body) {
    return res.status(400).json({ error: 'Le nom de la règle et le message de réponse sont requis' });
  }
  if (match_type !== 'any' && (!keyword || !String(keyword).trim())) {
    return res.status(400).json({ error: 'Veuillez renseigner au moins un mot-clé déclencheur' });
  }

  const [created] = await q(
    `INSERT INTO auto_reply_rules(
       tenant_id, name, keyword, match_type, channel, reply_channel,
       reply_subject, reply_body, reply_metadata, add_tag, is_active
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.tid,
      name.trim(),
      match_type === 'any' ? '*' : String(keyword).trim(),
      match_type,
      channel,
      reply_channel,
      reply_subject || null,
      reply_body,
      JSON.stringify(reply_metadata || {}),
      add_tag ? add_tag.trim() : null,
      Boolean(is_active)
    ]
  );

  res.json(created);
}));

app.put('/api/auto-replies/:id', auth, wrap(async (req, res) => {
  const {
    name,
    keyword,
    match_type = 'contains',
    channel = 'all',
    reply_channel = 'same',
    reply_subject = '',
    reply_body,
    reply_metadata = {},
    add_tag = '',
    is_active = true
  } = req.body;

  const [updated] = await q(
    `UPDATE auto_reply_rules
     SET name=$1, keyword=$2, match_type=$3, channel=$4, reply_channel=$5,
         reply_subject=$6, reply_body=$7, reply_metadata=$8, add_tag=$9, is_active=$10
     WHERE id=$11 AND tenant_id=$12 RETURNING *`,
    [
      name.trim(),
      match_type === 'any' ? '*' : String(keyword || '').trim(),
      match_type,
      channel,
      reply_channel,
      reply_subject || null,
      reply_body,
      JSON.stringify(reply_metadata || {}),
      add_tag ? add_tag.trim() : null,
      Boolean(is_active),
      +req.params.id,
      req.user.tid
    ]
  );

  if (!updated) return res.status(404).json({ error: 'Règle introuvable' });
  res.json(updated);
}));

app.post('/api/auto-replies/:id/toggle', auth, wrap(async (req, res) => {
  const [updated] = await q(
    'UPDATE auto_reply_rules SET is_active = NOT is_active WHERE id=$1 AND tenant_id=$2 RETURNING *',
    [+req.params.id, req.user.tid]
  );
  if (!updated) return res.status(404).json({ error: 'Règle introuvable' });
  res.json(updated);
}));

app.delete('/api/auto-replies/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM auto_reply_rules WHERE id=$1 AND tenant_id=$2', [+req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* ============================================================================
 * 7. MONTAGE DE L'API PUBLIQUE CLIENTE (/api/v1/*)
 * ========================================================================== */
app.use('/api/v1', publicApiV1Router);

/* ============================================================================
 * 8. JOURNAL DES MESSAGES & STATISTIQUES (/api/messages, /api/stats)
 * ========================================================================== */
app.get('/api/messages', auth, wrap(async (req, res) => {
  const { contactId, allTenants } = req.query;
  const [u] = await q('SELECT role FROM users WHERE id=$1', [req.user.uid]);
  const isSuper = (u?.role || req.user.role) === 'superadmin';

  if (isSuper && allTenants === '1') {
    return res.json(
      await q(
        `SELECT m.*, c.name AS contact_name, t.name AS tenant_name, t.sender_id AS tenant_sender
         FROM messages m
         LEFT JOIN contacts c ON c.id=m.contact_id
         LEFT JOIN tenants t ON t.id=m.tenant_id
         ORDER BY m.created_at DESC LIMIT 500`
      )
    );
  }

  res.json(
    await q(
      `SELECT m.*, c.name AS contact_name, t.name AS tenant_name
       FROM messages m
       LEFT JOIN contacts c ON c.id=m.contact_id
       LEFT JOIN tenants t ON t.id=m.tenant_id
       WHERE m.tenant_id=$1 AND ($2::int IS NULL OR m.contact_id=$2)
       ORDER BY m.created_at DESC LIMIT 500`,
      [req.user.tid, contactId || null]
    )
  );
}));

app.get('/api/stats', auth, wrap(async (req, res) => {
  const [u] = await q('SELECT role FROM users WHERE id=$1', [req.user.uid]);
  const isSuper = (u?.role || req.user.role) === 'superadmin';
  const scopeAll = isSuper && req.query.allTenants === '1';
  const tid = req.user.tid;

  const whereClause = scopeAll ? '1=1' : 'tenant_id=$1';
  const params = scopeAll ? [] : [tid];

  const [contactsRow] = await q(`SELECT count(*)::int n FROM contacts WHERE ${whereClause}`, params);
  const [clientsRow] = await q('SELECT count(*)::int n FROM tenants');
  const [totals] = await q(
    `SELECT
       count(*)::int AS total_tx,
       count(*) FILTER (WHERE status IN ('sent','received','delivered'))::int AS success_tx,
       count(*) FILTER (WHERE status = 'delivered')::int AS delivered_tx,
       count(*) FILTER (WHERE status = 'failed')::int AS failed_tx,
       count(*) FILTER (WHERE status = 'queued')::int AS queued_tx,
       count(*) FILTER (WHERE direction = 'out')::int AS out_tx,
       count(*) FILTER (WHERE direction = 'in')::int AS in_tx,
       COALESCE(sum(cost), 0)::float AS total_cost,
       COALESCE(sum(buy_cost), 0)::float AS total_buy_cost,
       COALESCE(avg(NULLIF(latency_ms, 0)), 38)::int AS avg_latency_ms
     FROM messages WHERE ${whereClause}`,
    params
  );

  const byChannel = await q(
    `SELECT channel, direction, count(*)::int n, COALESCE(sum(cost),0)::float AS cost
     FROM messages WHERE ${whereClause} GROUP BY 1,2`,
    params
  );

  const byOperator = await q(
    `SELECT
       COALESCE(operator, 'Route Directe') AS operator,
       channel,
       count(*)::int AS total,
       count(*) FILTER (WHERE direction='out')::int AS sent,
       count(*) FILTER (WHERE status='delivered')::int AS delivered,
       count(*) FILTER (WHERE direction='in')::int AS received,
       count(*) FILTER (WHERE status='failed')::int AS failed,
       COALESCE(sum(cost), 0)::float AS cost,
       COALESCE(sum(buy_cost), 0)::float AS buy_cost,
       COALESCE(avg(NULLIF(latency_ms, 0)), 38)::int AS avg_latency_ms
     FROM messages
     WHERE ${whereClause}
     GROUP BY 1, 2
     ORDER BY total DESC`,
    params
  );

  const byDay = await q(
    `SELECT
       to_char(created_at, 'YYYY-MM-DD') AS day,
       count(*)::int AS total,
       count(*) FILTER (WHERE direction='out')::int AS out_n,
       count(*) FILTER (WHERE direction='in')::int AS in_n,
       COALESCE(sum(cost), 0)::float AS cost
     FROM messages
     WHERE ${whereClause}
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 14`,
    params
  );

  res.json({
    contacts: contactsRow.n,
    totalClients: clientsRow?.n || 1,
    totals,
    byChannel,
    byOperator,
    byDay
  });
}));

/* ============================================================================
 * 8b. SYSTÈME DE RAPPORTS ANALYTIQUES, TECHNIQUES & FINANCIERS (/api/reports)
 * ========================================================================== */
app.get('/api/reports', auth, wrap(async (req, res) => {
  const [u] = await q('SELECT role FROM users WHERE id=$1', [req.user.uid]);
  const isSuper = (u?.role || req.user.role) === 'superadmin';
  const scopeAll = isSuper && req.query.allTenants === '1';

  const {
    period = '30d', // 'today' | '7d' | '30d' | '90d' | 'all' | 'custom'
    dateFrom = '',
    dateTo = '',
    channel = 'all',
    operator = 'all',
    tenantFilter = 'all'
  } = req.query;

  const conds = [];
  const params = [];

  if (!scopeAll) {
    params.push(req.user.tid);
    conds.push(`m.tenant_id = $${params.length}`);
  } else if (tenantFilter && tenantFilter !== 'all') {
    params.push(+tenantFilter);
    conds.push(`m.tenant_id = $${params.length}`);
  }

  if (period === 'today') {
    conds.push(`m.created_at >= date_trunc('day', now())`);
  } else if (period === '7d') {
    conds.push(`m.created_at >= now() - interval '7 days'`);
  } else if (period === '30d') {
    conds.push(`m.created_at >= now() - interval '30 days'`);
  } else if (period === '90d') {
    conds.push(`m.created_at >= now() - interval '90 days'`);
  } else if (period === 'custom') {
    if (dateFrom) {
      params.push(new Date(dateFrom).toISOString());
      conds.push(`m.created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      const endDay = new Date(dateTo);
      endDay.setHours(23, 59, 59, 999);
      params.push(endDay.toISOString());
      conds.push(`m.created_at <= $${params.length}::timestamptz`);
    }
  }

  if (channel && channel !== 'all') {
    params.push(channel);
    conds.push(`m.channel = $${params.length}`);
  }

  if (operator && operator !== 'all') {
    params.push(`%${operator}%`);
    conds.push(`COALESCE(m.operator, '') ILIKE $${params.length}`);
  }

  const whereSql = conds.length > 0 ? conds.join(' AND ') : '1=1';

  const [summary] = await q(
    `SELECT
       count(*)::int AS total_tx,
       count(*) FILTER (WHERE m.direction = 'out')::int AS outbound_tx,
       count(*) FILTER (WHERE m.direction = 'in')::int AS inbound_tx,
       count(*) FILTER (WHERE m.status = 'delivered')::int AS delivered_tx,
       count(*) FILTER (WHERE m.status IN ('sent','delivered'))::int AS sent_or_delivered_tx,
       count(*) FILTER (WHERE m.status = 'failed')::int AS failed_tx,
       count(*) FILTER (WHERE m.status = 'queued')::int AS scheduled_tx,
       count(*) FILTER (WHERE m.channel = 'email' AND m.dlr_code LIKE 'OPENED%')::int AS email_opened_tx,
       count(*) FILTER (WHERE m.channel = 'rcs' AND m.status = 'delivered')::int AS rcs_delivered_tx,
       COALESCE(sum(m.cost), 0)::float AS total_cost,
       COALESCE(sum(m.buy_cost), 0)::float AS total_buy_cost,
       COALESCE(avg(NULLIF(m.latency_ms, 0)), 36)::int AS avg_latency_ms
     FROM messages m
     WHERE ${whereSql}`,
    params
  );

  const byChannel = await q(
    `SELECT
       m.channel,
       count(*)::int AS total,
       count(*) FILTER (WHERE m.direction = 'out')::int AS outbound,
       count(*) FILTER (WHERE m.direction = 'in')::int AS inbound,
       count(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
       count(*) FILTER (WHERE m.status = 'failed')::int AS failed,
       COALESCE(sum(m.cost), 0)::float AS cost,
       COALESCE(sum(m.buy_cost), 0)::float AS buy_cost,
       COALESCE(avg(NULLIF(m.latency_ms, 0)), 36)::int AS avg_latency_ms
     FROM messages m
     WHERE ${whereSql}
     GROUP BY m.channel
     ORDER BY total DESC`,
    params
  );

  const byOperator = await q(
    `SELECT
       COALESCE(m.operator, 'Passerelle Directe') AS operator,
       m.channel,
       count(*)::int AS total,
       count(*) FILTER (WHERE m.direction = 'out')::int AS outbound,
       count(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
       count(*) FILTER (WHERE m.direction = 'in')::int AS inbound,
       count(*) FILTER (WHERE m.status = 'failed')::int AS failed,
       COALESCE(sum(m.cost), 0)::float AS cost,
       COALESCE(sum(m.buy_cost), 0)::float AS buy_cost,
       COALESCE(avg(NULLIF(m.latency_ms, 0)), 36)::int AS avg_latency_ms
     FROM messages m
     WHERE ${whereSql}
     GROUP BY 1, 2
     ORDER BY total DESC`,
    params
  );

  const byDay = await q(
    `SELECT
       to_char(m.created_at, 'YYYY-MM-DD') AS day,
       count(*)::int AS total,
       count(*) FILTER (WHERE m.channel = 'sms')::int AS sms_n,
       count(*) FILTER (WHERE m.channel = 'rcs')::int AS rcs_n,
       count(*) FILTER (WHERE m.channel = 'whatsapp')::int AS whatsapp_n,
       count(*) FILTER (WHERE m.channel = 'email')::int AS email_n,
       count(*) FILTER (WHERE m.status = 'delivered')::int AS delivered_n,
       count(*) FILTER (WHERE m.status = 'failed')::int AS failed_n,
       COALESCE(sum(m.cost), 0)::float AS cost,
       COALESCE(sum(m.buy_cost), 0)::float AS buy_cost
     FROM messages m
     WHERE ${whereSql}
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 31`,
    params
  );

  const campCond = scopeAll
    ? tenantFilter && tenantFilter !== 'all'
      ? `c.tenant_id = ${Number(tenantFilter)}`
      : '1=1'
    : `c.tenant_id = ${Number(req.user.tid)}`;

  const campaigns = await q(
    `SELECT c.*, t.name AS tenant_name
     FROM campaigns c
     LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE ${campCond}
     ORDER BY c.created_at DESC
     LIMIT 50`
  );

  let byTenant = [];
  if (scopeAll) {
    byTenant = await q(
      `SELECT
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.plan,
         t.sender_id,
         count(m.id)::int AS total_tx,
         count(m.id) FILTER (WHERE m.channel='sms' AND m.direction='out')::int AS sms_tx,
         count(m.id) FILTER (WHERE m.channel='rcs' AND m.direction='out')::int AS rcs_tx,
         count(m.id) FILTER (WHERE m.channel='whatsapp' AND m.direction='out')::int AS whatsapp_tx,
         count(m.id) FILTER (WHERE m.channel='email' AND m.direction='out')::int AS email_tx,
         count(m.id) FILTER (WHERE m.status='delivered')::int AS delivered_tx,
         COALESCE(sum(m.cost), 0)::float AS revenue_usd,
         COALESCE(sum(m.buy_cost), 0)::float AS buy_cost_usd
       FROM tenants t
       LEFT JOIN messages m ON m.tenant_id = t.id AND (${whereSql})
       GROUP BY t.id, t.name, t.plan, t.sender_id
       ORDER BY revenue_usd DESC, total_tx DESC`,
      params
    );
  }

  const transactions = await q(
    `SELECT
       m.id, m.tx_ref, m.channel, m.direction, m.addr, m.sender_addr, m.operator,
       m.subject, m.body, m.status, m.dlr_code, m.latency_ms, m.cost, m.buy_cost,
       m.created_at, m.delivered_at,
       c.name AS contact_name,
       t.name AS tenant_name
     FROM messages m
     LEFT JOIN contacts c ON c.id = m.contact_id
     LEFT JOIN tenants t ON t.id = m.tenant_id
     WHERE ${whereSql}
     ORDER BY m.created_at DESC
     LIMIT 300`,
    params
  );

  res.json({
    generatedAt: new Date().toISOString(),
    filters: { period, dateFrom, dateTo, channel, operator, tenantFilter },
    summary,
    byChannel,
    byOperator,
    byDay,
    campaigns,
    byTenant,
    transactions
  });
}));

/* ============================================================================
 * 9. WEBHOOKS TÉLÉCOMS ENTRANTS (MO) & ACCUSÉS DE LIVRAISON (DLR) (/webhooks/*)
 * ========================================================================== */
const handleOperatorDlr = wrap(async (req, res) => {
  const opParam = (req.params.operator || '').toLowerCase();
  const opLabels = {
    vodacom: 'Vodacom RDC',
    airtel: 'Airtel RDC',
    orange: 'Orange RDC',
    africell: 'Africell RDC',
    whatsapp: 'WhatsApp Direct'
  };

  const payload = { ...(req.query || {}), ...(req.body || {}) };
  const orangeNotif = payload.deliveryInfoNotification;
  const providerId =
    payload.messageId ||
    payload.id ||
    payload.provider_id ||
    payload.MessageSid ||
    orangeNotif?.callbackData ||
    '';
  const txRef = payload.txRef || payload.tx_ref || '';
  const rawStatus =
    payload.status ||
    payload.dlrStatus ||
    payload.stat ||
    payload.MessageStatus ||
    orangeNotif?.deliveryInfo?.deliveryStatus ||
    'DELIVRD';
  const rawErr = payload.err || payload.errorCode || payload.dlrCode || '000';

  const out = await processDlrEvent({
    providerId,
    txRef,
    operator: opLabels[opParam] || payload.operator || undefined,
    rawStatus,
    rawErr,
    rawPayload: payload
  });

  res.json(out);
});

app.post('/webhooks/dlr/:operator', webhookLimiter, handleOperatorDlr);
app.get('/webhooks/dlr/:operator', webhookLimiter, handleOperatorDlr);
app.post('/webhooks/telecom-status', webhookLimiter, handleOperatorDlr);

app.post('/webhooks/inbound/:operator', webhookLimiter, wrap(async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };
  const inboundMsg = payload.inboundSMSMessageNotification?.inboundSMSMessage;
  const from =
    payload.from ||
    payload.msisdn ||
    payload.sender ||
    payload.From ||
    inboundMsg?.senderAddress ||
    '';
  const toDest =
    payload.to ||
    payload.senderId ||
    payload.shortCode ||
    payload.recipient ||
    inboundMsg?.destinationAddress ||
    '';
  const text =
    payload.text ||
    payload.message ||
    payload.content ||
    payload.Body ||
    inboundMsg?.message ||
    '';
  const msgId =
    payload.messageId ||
    payload.id ||
    payload.MessageSid ||
    inboundMsg?.messageId ||
    `mo-${Date.now()}`;
  const channel = payload.channel === 'rcs' || String(from).startsWith('rcs:') ? 'rcs' : 'sms';

  let targetTenantId = payload.tenantId ? +payload.tenantId : null;
  if (!targetTenantId && toDest) {
    const cleanDest = String(toDest).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const [tMatch] = await q('SELECT id FROM tenants WHERE upper(sender_id)=$1 LIMIT 1', [cleanDest]);
    if (tMatch) targetTenantId = tMatch.id;
  }
  if (!targetTenantId && from) {
    const [cMatch] = await q(
      "SELECT tenant_id FROM contacts WHERE regexp_replace(coalesce(phone,''),'\\D','','g') = regexp_replace($1,'\\D','','g') ORDER BY id DESC LIMIT 1",
      [from]
    );
    if (cMatch) targetTenantId = cMatch.tenant_id;
  }
  if (!targetTenantId) {
    const [fallback] = await q("SELECT id FROM tenants WHERE name != 'Rayons CRM (Master)' ORDER BY id ASC LIMIT 1");
    targetTenantId = fallback?.id || 1;
  }

  const opParam = (req.params.operator || '').toLowerCase();
  const opLabels = {
    vodacom: 'Vodacom RDC',
    airtel: 'Airtel RDC',
    orange: 'Orange RDC',
    africell: 'Africell RDC'
  };
  const operator = opLabels[opParam] || payload.operator || detectTelecomOperator(from).label;

  const saved = await inbound(targetTenantId, channel, from, text, msgId, operator);
  res.json({ ok: true, tenantId: targetTenantId, txRef: saved.tx_ref, optOut: saved.optOut });
}));

app.post('/webhooks/telecom/:tid', webhookLimiter, wrap(async (req, res) => {
  const from = req.body.from || req.body.msisdn || req.body.sender || req.body.From || '';
  const text = req.body.text || req.body.message || req.body.content || req.body.Body || '';
  const msgId = req.body.messageId || req.body.id || req.body.MessageSid || `in-${Date.now()}`;
  const channel = req.body.channel === 'rcs' || from.startsWith('rcs:') ? 'rcs' : 'sms';
  const operator = req.body.operator || detectTelecomOperator(from).label;
  const saved = await inbound(+req.params.tid, channel, from, text, msgId, operator);
  res.json({ ok: true, txRef: saved.tx_ref, optOut: saved.optOut });
}));

app.get('/webhooks/whatsapp/:tid', (req, res) =>
  req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN
    ? res.send(req.query['hub.challenge'])
    : res.sendStatus(403)
);

app.post('/webhooks/whatsapp/:tid', webhookLimiter, wrap(async (req, res) => {
  for (const e of req.body.entry || [])
    for (const ch of e.changes || []) {
      for (const m of ch.value?.messages || [])
        await inbound(+req.params.tid, 'whatsapp', m.from, m.text?.body || `[${m.type}]`, m.id, 'WhatsApp Direct');
      for (const s of ch.value?.statuses || [])
        await processDlrEvent({
          providerId: s.id,
          operator: 'WhatsApp Direct',
          rawStatus: s.status,
          rawPayload: s
        });
    }
  res.sendStatus(200);
}));

// Pixel de suivi d'ouverture d'Email (1x1 GIF transparent)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
app.get('/webhooks/email/open/:txRefFile', wrap(async (req, res) => {
  const txRef = String(req.params.txRefFile || '').replace(/\.gif$/i, '');
  if (txRef) {
    const [m] = await q('SELECT id, tenant_id, addr, operator FROM messages WHERE tx_ref=$1 LIMIT 1', [txRef]);
    if (m) {
      await q(
        "UPDATE messages SET status='delivered', dlr_code='OPENED 200', delivered_at=COALESCE(delivered_at, now()) WHERE id=$1",
        [m.id]
      );
      await q(
        `INSERT INTO webhook_logs(tenant_id, operator, event_type, tx_ref, msisdn, status, dlr_code, latency_ms, raw_payload)
         VALUES($1, $2, 'email_open', $3, $4, 'delivered', 'OPENED 200', 12, $5)`,
        [m.tenant_id, m.operator || 'Email Direct', txRef, m.addr, JSON.stringify({ txRef, openedAt: new Date().toISOString() })]
      );
    }
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(TRANSPARENT_GIF);
}));

// Lien de désabonnement Email en 1 clic (List-Unsubscribe)
app.get('/webhooks/email/unsubscribe', wrap(async (req, res) => {
  const tid = Number(req.query.tid || 1);
  const email = String(req.query.email || '').trim().toLowerCase();
  if (email && email.includes('@')) {
    await q(
      `INSERT INTO blacklist(tenant_id, addr, reason)
       VALUES($1, $2, 'Désabonnement Email en 1 clic')
       ON CONFLICT (tenant_id, addr) DO NOTHING`,
      [tid, email]
    );
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Désabonnement confirmé</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#f4f4f5;padding:48px 16px;text-align:center;">
  <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:28px;">
    <h2 style="margin:0 0 10px 0;font-size:18px;color:#18181b;">Désabonnement pris en compte</h2>
    <p style="margin:0;color:#52525b;font-size:14px;line-height:1.5;">
      L'adresse <strong>${email || 'indiquée'}</strong> a été retirée de la liste de diffusion de ce compte Rayons CRM.
    </p>
  </div>
</body>
</html>`);
}));

const isCloudFunction = Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE);

if (!isCloudFunction) {
  app.listen(process.env.PORT || 4000, () => {
    q('SELECT 1')
      .then(() => startQueueWorker(5000))
      .catch(console.error);
    console.log('API Rayons CRM SaaS v2.2 (Rapports + Emailing Direct + Envoi en Masse + RCS RBM) prête');
  });
}

export { app };
