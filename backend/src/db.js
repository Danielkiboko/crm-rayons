import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import {
  hydratePGliteFromFirestore,
  detectTouchedTables,
  syncTablesToFirestore,
  syncAllTablesToFirestore
} from './firestoreSync.js';

const rawDatabaseUrl = (process.env.DATABASE_URL || '').trim();
const isLocalUrl =
  !rawDatabaseUrl ||
  /^postgres(ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1)(:|\/|$)/i.test(rawDatabaseUrl);
const isSupabaseUrl = /supabase\.(co|com)/i.test(rawDatabaseUrl);
const isRemoteDb = Boolean(rawDatabaseUrl) && !isLocalUrl;

function buildPgPoolConfig(connectionString, remote) {
  if (!connectionString) return { connectionTimeoutMillis: 1500 };
  let cleanUrl = connectionString;
  if (remote) {
    try {
      const parsed = new URL(connectionString);
      parsed.searchParams.delete('sslmode');
      cleanUrl = parsed.toString();
    } catch {
      // keep raw connectionString if URL parsing fails
    }
  }
  return {
    connectionString: cleanUrl,
    connectionTimeoutMillis: remote ? 10000 : 1500,
    ...(remote ? { ssl: { rejectUnauthorized: false } } : {})
  };
}

export const pool = new pg.Pool(buildPgPoolConfig(rawDatabaseUrl, isRemoteDb));

let queryFnPromise;
export let dbEngineType = 'postgresql';

export const generateApiKey = () => 'ray_live_' + crypto.randomBytes(16).toString('hex');

export const PLAN_PRESETS = {
  starter: {
    label: 'Starter',
    maxContacts: 500,
    maxSms: 1000,
    maxWhatsapp: 1000,
    maxRcs: 500,
    maxEmails: 5000,
    maxSpendUsd: 25,
    allowedChannels: ['sms', 'whatsapp', 'email']
  },
  business: {
    label: 'Business',
    maxContacts: 5000,
    maxSms: 10000,
    maxWhatsapp: 10000,
    maxRcs: 5000,
    maxEmails: 25000,
    maxSpendUsd: 150,
    allowedChannels: ['sms', 'whatsapp', 'rcs', 'email']
  },
  enterprise: {
    label: 'Enterprise',
    maxContacts: 50000,
    maxSms: 100000,
    maxWhatsapp: 100000,
    maxRcs: 50000,
    maxEmails: 250000,
    maxSpendUsd: 1000,
    allowedChannels: ['sms', 'whatsapp', 'rcs', 'email']
  }
};

export const DEFAULT_TELECOM_SETTINGS = {
  telecom: {
    senderId: 'RAYONS',
    rcsAgent: 'RAYONS_RCS',
    vodacom: {
      protocol: 'http_json',
      mode: 'sandbox_dlr',
      gatewayUrl: 'https://sdp.vodacom.cd/api/v1/sms/send',
      authType: 'bearer',
      apiKey: '',
      username: '',
      password: '',
      smppHost: 'smpp.vodacom.cd',
      smppPort: '2775',
      systemId: 'rayons_voda',
      smppPassword: '',
      systemType: 'SMPP',
      senderId: 'RAYONS',
      buyCost: '0.009',
      smsCost: '0.015'
    },
    airtel: {
      protocol: 'http_json',
      mode: 'sandbox_dlr',
      gatewayUrl: 'https://messaging.airtel.cd/api/v1/messages',
      authType: 'bearer',
      apiKey: '',
      username: '',
      password: '',
      smppHost: 'smpp.airtel.cd',
      smppPort: '2775',
      systemId: 'rayons_airtel',
      smppPassword: '',
      systemType: 'SMPP',
      senderId: 'RAYONS',
      buyCost: '0.008',
      smsCost: '0.014'
    },
    orange: {
      protocol: 'orange_sdp',
      mode: 'sandbox_dlr',
      gatewayUrl: 'https://api.orange.cd/smsmessaging/v1/outbound',
      authType: 'bearer',
      apiKey: '',
      username: '',
      password: '',
      smppHost: 'smpp.orange.cd',
      smppPort: '2775',
      systemId: 'rayons_orange',
      smppPassword: '',
      systemType: 'SMPP',
      senderId: 'RAYONS',
      buyCost: '0.009',
      smsCost: '0.015'
    },
    africell: {
      protocol: 'http_get',
      mode: 'sandbox_dlr',
      gatewayUrl: 'https://gw.africell.cd/api/sms/send',
      authType: 'basic',
      apiKey: '',
      username: 'rayons_afri',
      password: '',
      smppHost: 'smpp.africell.cd',
      smppPort: '2775',
      systemId: 'rayons_afri',
      smppPassword: '',
      systemType: 'SMPP',
      senderId: 'RAYONS',
      buyCost: '0.007',
      smsCost: '0.012'
    }
  },
  whatsapp: { phoneId: '', token: '', buyCost: '0.005', cost: '0.008' },
  rcs: {
    agentId: 'RAYONS_RCS_CD',
    agentName: 'Rayons CRM Officiel',
    brandColor: '#1d4ed8',
    jibeGatewayUrl: 'https://rbm.googleapis.com/v1/phones',
    smsFallback: true,
    buyCost: '0.012',
    cost: '0.020'
  },
  emailDirect: {
    host: '',
    port: '587',
    appPassword: '',
    fromName: 'Rayons CRM',
    replyTo: 'admin@rayons.net',
    signature: 'Cordialement,\nService Client',
    mode: 'auto'
  }
};

async function runMigrationsAndSeed(execQuery) {
  await execQuery("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'business'");
  await execQuery("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
  await execQuery("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sender_id TEXT NOT NULL DEFAULT 'RAYONS'");
  await execQuery("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key TEXT");
  await execQuery("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limits JSONB NOT NULL DEFAULT '{}'");

  await execQuery(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('sms','email','rcs','whatsapp')),
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      scheduled_at TIMESTAMPTZ,
      total_recipients INT DEFAULT 0,
      sent_count INT DEFAULT 0,
      delivered_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      total_cost NUMERIC(10,4) DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await execQuery("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'");

  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS campaign_id INT');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_addr TEXT');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS operator TEXT');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS tx_ref TEXT');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS cost NUMERIC(10,4) DEFAULT 0');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS buy_cost NUMERIC(10,4) DEFAULT 0');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS dlr_code TEXT');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0');
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ');
  await execQuery("ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'");
  await execQuery('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT true');

  await execQuery(`
    CREATE TABLE IF NOT EXISTS auto_reply_rules (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      keyword TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains',
      channel TEXT NOT NULL DEFAULT 'all',
      reply_channel TEXT NOT NULL DEFAULT 'same',
      reply_subject TEXT,
      reply_body TEXT NOT NULL,
      reply_metadata JSONB NOT NULL DEFAULT '{}',
      add_tag TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      trigger_count INT NOT NULL DEFAULT 0,
      last_triggered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('sms','email','rcs','whatsapp')),
      subject TEXT,
      body TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await execQuery("ALTER TABLE templates ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'");

  await execQuery(`
    CREATE TABLE IF NOT EXISTS credit_logs (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      amount_usd NUMERIC(10,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'M-Pesa Vodacom',
      reference TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS recharge_requests (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      amount_usd NUMERIC(10,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'M-Pesa Vodacom',
      payer_phone TEXT,
      reference TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      addr TEXT NOT NULL,
      reason TEXT DEFAULT 'STOP SMS',
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant_id, addr)
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id SERIAL PRIMARY KEY,
      tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
      operator TEXT NOT NULL,
      event_type TEXT NOT NULL,
      provider_id TEXT,
      tx_ref TEXT,
      msisdn TEXT,
      status TEXT,
      dlr_code TEXT,
      latency_ms INT DEFAULT 0,
      raw_payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      ip_addr TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await execQuery(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const adminEmail = (process.env.ADMIN_EMAIL || 'danielkiboko218@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const existingAdmin = await execQuery("SELECT id, tenant_id FROM users WHERE role='superadmin' LIMIT 1");

  if (existingAdmin.length === 0) {
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const [tenant] = await execQuery(
      'INSERT INTO tenants(name, plan, status, sender_id, api_key, limits, settings) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [
        'Rayons CRM',
        'enterprise',
        'active',
        'RAYONS',
        generateApiKey(),
        JSON.stringify(PLAN_PRESETS.enterprise),
        JSON.stringify(DEFAULT_TELECOM_SETTINGS)
      ]
    );
    await execQuery(
      'INSERT INTO users(tenant_id, email, password_hash, role) VALUES($1, $2, $3, $4)',
      [tenant.id, adminEmail, adminHash, 'superadmin']
    );
  }

  // Attribuer une clé API à tous les tenants qui n'en ont pas encore
  const withoutKey = await execQuery('SELECT id FROM tenants WHERE api_key IS NULL');
  for (const row of withoutKey) {
    await execQuery('UPDATE tenants SET api_key=$1 WHERE id=$2', [generateApiKey(), row.id]);
  }
}

async function getQueryFn() {
  const dbMode = (process.env.DB_MODE || '').toLowerCase();
  const isCloudFunction = Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE);
  const useFirestore = dbMode === 'firestore' || (isCloudFunction && dbMode !== 'postgres' && dbMode !== 'local');

  if (useFirestore) {
    await pool.end().catch(() => {});
    const db = new PGlite();
    const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    await db.exec(schema);
    const { snapshots, totalDocs } = await hydratePGliteFromFirestore(db);
    const rawFn = (text, params) => db.query(text, params).then(r => r.rows);
    await runMigrationsAndSeed(rawFn).catch(console.error);
    await syncAllTablesToFirestore(db, snapshots);
    dbEngineType = 'firebase-firestore';
    console.log(`Base Firebase Cloud Firestore prête pour Rayons CRM (${totalDocs} documents chargés)`);

    let writeChain = Promise.resolve();
    return async (text, params) => {
      const touched = detectTouchedTables(text);
      if (touched.length === 0) {
        return rawFn(text, params);
      }
      const run = writeChain.then(async () => {
        const rows = await rawFn(text, params);
        await syncTablesToFirestore(db, snapshots, touched);
        return rows;
      });
      writeChain = run.catch(() => {});
      return run;
    };
  }

  const forceLocal = dbMode === 'local';
  if (!forceLocal && rawDatabaseUrl) {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query("SELECT to_regclass('public.tenants') AS t");
        if (!rows[0]?.t) {
          const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
          await client.query(schema);
          console.log('Schéma SQL Rayons CRM initialisé sur PostgreSQL');
        }
      } finally {
        client.release();
      }
      dbEngineType = isSupabaseUrl ? 'supabase-postgresql' : 'postgresql-native';
      const fn = (text, params) => pool.query(text, params).then(r => r.rows);
      await runMigrationsAndSeed(fn).catch(console.error);
      console.log(
        isSupabaseUrl
          ? 'Base Supabase PostgreSQL connectée et prête pour Rayons CRM'
          : 'Base PostgreSQL native connectée et prête pour Rayons CRM'
      );
      return fn;
    } catch (err) {
      if (isRemoteDb) {
        console.error('Échec de connexion à PostgreSQL/Supabase distant:', err.message);
      }
      await pool.end().catch(() => {});
    }
  } else {
    await pool.end().catch(() => {});
  }

  dbEngineType = 'pglite-embedded';
  const dataDir = new URL('../.pgdata', import.meta.url).pathname;
  const db = new PGlite(dataDir);
  const { rows } = await db.query("SELECT to_regclass('public.tenants') AS t");
  if (!rows[0]?.t) {
    const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    await db.exec(schema);
  }
  const fn = (text, params) => db.query(text, params).then(r => r.rows);
  await runMigrationsAndSeed(fn).catch(console.error);
  console.log('Base PostgreSQL locale (PGlite) prête pour Rayons CRM (Architecture Backend Modulaire)');
  return fn;
}

export const q = async (text, params) => {
  if (!queryFnPromise) queryFnPromise = getQueryFn();
  const fn = await queryFnPromise;
  return fn(text, params);
};
