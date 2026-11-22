import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { q } from '../db.js';

/**
 * Génère un jeton JWT signé pour un utilisateur
 */
export function signToken(u) {
  return jwt.sign(
    { uid: u.id, tid: u.tenant_id, email: u.email, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Middleware d'en-têtes de sécurité HTTP, identifiant de requête (X-Request-Id) et temps de réponse
 */
export function securityAndTelemetryHeaders(req, res, next) {
  const reqId = `req_${crypto.randomBytes(6).toString('hex')}`;
  const start = process.hrtime.bigint();
  req.requestId = reqId;

  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By', 'Rayons-CRM-Engine/2.0');

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }
  });

  next();
}

/**
 * Limiteur de débit (Rate Limiter) en mémoire par fenêtre glissante
 */
export function createRateLimiter({ windowMs = 60_000, max = 120, keyPrefix = 'global' } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const clientKey =
      req.headers['x-api-key'] ||
      req.user?.tid ||
      req.ip ||
      req.socket?.remoteAddress ||
      'anon';
    const key = `${keyPrefix}:${clientKey}`;

    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return res.status(429).json({
        error: `Trop de requêtes (${max} max par ${Math.round(windowMs / 1000)}s). Veuillez patienter.`,
        retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000)
      });
    }

    // Nettoyage périodique léger
    if (buckets.size > 2000) {
      for (const [k, v] of buckets.entries()) {
        if (now > v.resetAt) buckets.delete(k);
      }
    }

    next();
  };
}

/**
 * Authentification JWT (Portail Web C-Panel & Espace Client)
 */
export function auth(req, res, next) {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || '').replace('Bearer ', ''),
      process.env.JWT_SECRET
    );
    next();
  } catch {
    res.status(401).json({ error: 'Non authentifié ou session expirée' });
  }
}

/**
 * Garde d'accès réservé au Super-Administrateur (Console C-Panel)
 */
export async function requireSuperAdmin(req, res, next) {
  const [u] = await q('SELECT role FROM users WHERE id=$1', [req.user.uid]);
  const role = u?.role || req.user.role;
  if (role !== 'superadmin') {
    return res.status(403).json({ error: 'Accès réservé au Super-Admin (C-Panel Rayons CRM)' });
  }
  next();
}

/**
 * Authentification par Clé API Cliente (X-API-Key: ray_live_...) pour l'API publique /api/v1/*
 */
export async function apiKeyAuth(req, res, next) {
  try {
    const apiKey =
      req.headers['x-api-key'] ||
      (req.headers.authorization?.startsWith('Bearer ray_live_')
        ? req.headers.authorization.replace('Bearer ', '')
        : '') ||
      req.body?.apiKey ||
      req.query?.apiKey ||
      '';

    if (!apiKey) {
      return res.status(401).json({
        error: 'Clé API manquante. Fournissez l’en-tête X-API-Key: ray_live_...'
      });
    }

    const [tenant] = await q('SELECT * FROM tenants WHERE api_key=$1', [apiKey]);
    if (!tenant) {
      return res.status(401).json({ error: 'Clé API invalide ou révoquée' });
    }
    if (tenant.status === 'suspended') {
      return res.status(403).json({
        error: 'Compte client suspendu. Contactez l’administrateur Rayons CRM.'
      });
    }

    req.tenant = tenant;
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * Signe un payload JSON sortant avec HMAC-SHA256 pour que le client puisse vérifier l'authenticité du Webhook
 */
export function signWebhookPayload(payloadObj, secretKey = '') {
  const raw = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
  const key = secretKey || process.env.JWT_SECRET || 'rayons-webhook-secret';
  const digest = crypto.createHmac('sha256', key).update(raw).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Enregistre un événement d'audit de sécurité dans la table audit_logs
 */
export async function logAudit({ tenantId = null, actorEmail = '', action, details = {}, req = null }) {
  try {
    const ip =
      req?.headers?.['x-forwarded-for'] ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    await q(
      `INSERT INTO audit_logs(tenant_id, actor_email, action, details, ip_addr)
       VALUES($1, $2, $3, $4, $5)`,
      [tenantId, actorEmail, action, JSON.stringify(details), String(ip)]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

