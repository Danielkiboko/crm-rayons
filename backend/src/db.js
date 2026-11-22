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
    fromName: '',
    replyTo: '',
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

  const existingRayons = await execQuery('SELECT id, tenant_id FROM users WHERE email=$1', ['admin@rayons.cd']);
  const existingRelais = await execQuery('SELECT id, tenant_id FROM users WHERE email=$1', ['admin@relais.io']);

  let masterTenantId;
  const adminHash = await bcrypt.hash('admin1234', 10);

  if (existingRayons.length > 0) {
    masterTenantId = existingRayons[0].tenant_id;
  } else if (existingRelais.length > 0) {
    masterTenantId = existingRelais[0].tenant_id;
    await execQuery(
      'INSERT INTO users(tenant_id, email, password_hash, role) VALUES($1, $2, $3, $4)',
      [masterTenantId, 'admin@rayons.cd', adminHash, 'superadmin']
    );
  } else {
    const [tenant] = await execQuery(
      'INSERT INTO tenants(name, plan, status, sender_id, api_key, limits, settings) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [
        'Rayons CRM (Master)',
        'enterprise',
        'active',
        'RAYONS',
        generateApiKey(),
        JSON.stringify(PLAN_PRESETS.enterprise),
        JSON.stringify(DEFAULT_TELECOM_SETTINGS)
      ]
    );
    masterTenantId = tenant.id;

    await execQuery(
      'INSERT INTO users(tenant_id, email, password_hash, role) VALUES($1, $2, $3, $4)',
      [masterTenantId, 'admin@rayons.cd', adminHash, 'superadmin']
    );
    await execQuery(
      'INSERT INTO users(tenant_id, email, password_hash, role) VALUES($1, $2, $3, $4)',
      [masterTenantId, 'admin@relais.io', adminHash, 'superadmin']
    );
  }

  await execQuery("UPDATE users SET role='superadmin' WHERE email IN ('admin@rayons.cd', 'admin@relais.io')");

  // Attribuer une clé API à tous les tenants qui n'en ont pas encore
  const withoutKey = await execQuery('SELECT id FROM tenants WHERE api_key IS NULL');
  for (const row of withoutKey) {
    await execQuery('UPDATE tenants SET api_key=$1 WHERE id=$2', [generateApiKey(), row.id]);
  }

  // Enrichir les messages existants avec buy_cost, dlr_code, latency_ms s'ils sont nuls
  await execQuery(`
    UPDATE messages
    SET
      buy_cost = CASE
        WHEN channel = 'sms' AND cost > 0 THEN ROUND((cost * 0.6)::numeric, 4)
        WHEN channel = 'whatsapp' AND cost > 0 THEN 0.0050
        WHEN channel = 'rcs' AND cost > 0 THEN 0.0120
        ELSE 0
      END,
      dlr_code = COALESCE(dlr_code, CASE
        WHEN status IN ('sent', 'delivered') AND channel != 'email' THEN 'DELIVRD 000'
        WHEN status = 'received' THEN 'MO_INBOUND'
        WHEN status = 'sent' AND channel = 'email' THEN '250 2.0.0 OK'
        ELSE 'ACCEPTD'
      END),
      status = CASE
        WHEN status = 'sent' AND direction = 'out' AND channel IN ('sms', 'whatsapp', 'rcs') THEN 'delivered'
        ELSE status
      END,
      delivered_at = COALESCE(delivered_at, created_at + interval '2 seconds'),
      latency_ms = CASE WHEN COALESCE(latency_ms, 0) = 0 THEN 42 ELSE latency_ms END
    WHERE dlr_code IS NULL
  `);

  // Modèles de messages par défaut s'il n'y en a aucun
  const tplCount = await execQuery('SELECT count(*)::int AS n FROM templates');
  if ((tplCount[0]?.n || 0) === 0) {
    const allTenants = await execQuery('SELECT id, name FROM tenants');
    for (const t of allTenants) {
      await execQuery(
        `INSERT INTO templates(tenant_id, name, channel, subject, body, metadata) VALUES
         ($1, 'Confirmation de commande', 'sms', NULL, 'Bonjour {{name}}, votre commande auprès de ' || $2 || ' a bien été enregistrée.', '{}'),
         ($1, 'Relance échéance', 'whatsapp', NULL, 'Bonjour {{name}}, nous vous rappelons que votre facture mensuelle est disponible.', '{}'),
         ($1, 'Bienvenue client', 'email', 'Bienvenue chez ' || $2, 'Bonjour {{name}},\n\nMerci pour votre confiance. Notre équipe reste disponible pour toute question.', '{"ctaLabel":"Accéder à mon espace","ctaUrl":"https://rayons.cd"}'),
         ($1, 'Carte Riche Promotion RCS', 'rcs', 'Nouvelle Offre Entreprise', 'Bonjour {{name}}, découvrez notre nouvelle offre dédiée aux entreprises en RDC avec support prioritaire.', '{"cardTitle":"Offre Business RDC","mediaUrl":"https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&auto=format&fit=crop&q=80","ctaLabel":"Voir l''offre","ctaUrl":"https://rayons.cd/offres","ctaPhone":"+243810000000","quickReplies":"Confirmer,Être rappelé,Tarifs","smsFallback":true}')`,
        [t.id, t.name]
      );
    }
  } else {
    const rcsTplCount = await execQuery("SELECT count(*)::int AS n FROM templates WHERE channel='rcs'");
    if ((rcsTplCount[0]?.n || 0) === 0) {
      const allTenants = await execQuery('SELECT id, name FROM tenants');
      for (const t of allTenants) {
        await execQuery(
          `INSERT INTO templates(tenant_id, name, channel, subject, body, metadata) VALUES
           ($1, 'Carte Riche Promotion RCS', 'rcs', 'Nouvelle Offre Entreprise', 'Bonjour {{name}}, découvrez notre nouvelle offre dédiée aux entreprises en RDC avec support prioritaire.', '{"cardTitle":"Offre Business RDC","mediaUrl":"http://localhost:4000/api/media/animated/pulse-promo.svg","ctaLabel":"Voir l''offre","ctaUrl":"https://rayons.cd/offres","ctaPhone":"+243810000000","quickReplies":"Confirmer,Être rappelé,Tarifs","smsFallback":true,"isAnimated":true}')`,
          [t.id]
        );
      }
    }
  }

  // Ajouter les modèles Emailing avec images animées ("images qui bougent") pour chaque compte s'ils n'existent pas encore
  const animTplCount = await execQuery("SELECT count(*)::int AS n FROM templates WHERE name ILIKE 'Email Animé%'");
  if ((animTplCount[0]?.n || 0) === 0) {
    const allTenants = await execQuery('SELECT id FROM tenants');
    for (const t of allTenants) {
      await execQuery(
        `INSERT INTO templates(tenant_id, name, channel, subject, body, metadata) VALUES
         ($1, 'Email Animé — Offre Flash Entreprise', 'email', 'Offre Prioritaire Entreprise — {{company}}', 'Bonjour {{name}},\n\nProfitez dès aujourd’hui de notre offre prioritaire dédiée aux entreprises opérant à Kinshasa, Lubumbashi et Goma.\n\nVotre compte bénéficie d’un accompagnement dédié et d’une tarification préférentielle.', '{"badgeText":"OFFRE FLASH ANIMÉE","cardTitle":"Activez votre avantage entreprise dès maintenant","mediaUrl":"http://localhost:4000/api/media/animated/pulse-promo.svg","ctaLabel":"Activer mon offre maintenant","ctaUrl":"https://rayons.cd/offres","accentColor":"#1d4ed8","isAnimated":true}'),
         ($1, 'Email Animé — Confirmation Mobile Money & Facture', 'email', 'Confirmation de paiement & Facture — {{company}}', 'Bonjour {{name}},\n\nNous vous confirmons la bonne réception de votre règlement Mobile Money / Banque. Votre solde et votre facture acquittée sont immédiatement disponibles dans votre espace client.', '{"badgeText":"PAIEMENT VALIDÉ","cardTitle":"Votre transaction a été créditée avec succès","mediaUrl":"http://localhost:4000/api/media/animated/live-payment.svg","ctaLabel":"Télécharger mon reçu officiel","ctaUrl":"https://rayons.cd/factures","accentColor":"#059669","isAnimated":true}'),
         ($1, 'Email Animé — Suivi de Livraison & Expédition', 'email', 'Votre commande est en route — {{company}}', 'Bonjour {{name}},\n\nVotre expédition vient de quitter notre centre logistique et est actuellement en cours d’acheminement vers votre adresse.\n\nVous pouvez suivre la progression en direct.', '{"badgeText":"EN COURS DE LIVRAISON","cardTitle":"Suivi en temps réel de votre expédition","mediaUrl":"http://localhost:4000/api/media/animated/delivery-radar.svg","ctaLabel":"Suivre mon colis en direct","ctaUrl":"https://rayons.cd/suivi","accentColor":"#4338ca","isAnimated":true}'),
         ($1, 'Email Animé — Invitation VIP & Événement', 'email', 'Invitation Privilège Partenaire — {{company}}', 'Bonjour {{name}},\n\nNous avons l’honneur de vous convier à notre prochaine session privée consacrée aux nouvelles solutions digitales et télécoms en République Démocratique du Congo.', '{"badgeText":"INVITATION VIP","cardTitle":"Rencontre Partenaires & Démonstration Live","mediaUrl":"http://localhost:4000/api/media/animated/vip-event.svg","ctaLabel":"Confirmer ma participation","ctaUrl":"https://rayons.cd/evenements","accentColor":"#7e22ce","isAnimated":true}')`,
        [t.id]
      );
    }
  }

  // Historique de rechargement initial si vide
  const credCount = await execQuery('SELECT count(*)::int AS n FROM credit_logs');
  if ((credCount[0]?.n || 0) === 0) {
    const clientTenants = await execQuery("SELECT id, plan FROM tenants WHERE name != 'Rayons CRM (Master)'");
    for (const ct of clientTenants) {
      const amt = ct.plan === 'business' ? 150 : 25;
      await execQuery(
        `INSERT INTO credit_logs(tenant_id, amount_usd, payment_method, reference, note)
         VALUES($1, $2, 'M-Pesa Vodacom', $3, 'Activation initiale du forfait')`,
        [ct.id, amt, `MPESA-${10000 + ct.id}`]
      );
    }
  }

  // Demande de rechargement Mobile Money en attente par défaut si vide
  const reqCount = await execQuery('SELECT count(*)::int AS n FROM recharge_requests');
  if ((reqCount[0]?.n || 0) === 0) {
    const [kivu] = await execQuery("SELECT id FROM tenants WHERE name ILIKE '%Kivu%' LIMIT 1");
    if (kivu) {
      await execQuery(
        `INSERT INTO recharge_requests(tenant_id, amount_usd, payment_method, payer_phone, reference, note, status)
         VALUES($1, 50.00, 'M-Pesa Vodacom', '+243 81 450 0111', 'MPESA-893420', 'Extension de budget campagne SMS fin de mois', 'pending')`,
        [kivu.id]
      );
    }
  }

  // Règles d'auto-répondeur par mots-clés par défaut pour chaque tenant
  const arCount = await execQuery('SELECT count(*)::int AS n FROM auto_reply_rules');
  if ((arCount[0]?.n || 0) === 0) {
    const allTenants = await execQuery('SELECT id FROM tenants');
    for (const t of allTenants) {
      await execQuery(
        `INSERT INTO auto_reply_rules(tenant_id, name, keyword, match_type, channel, reply_channel, reply_subject, reply_body, add_tag, is_active, trigger_count)
         VALUES
         ($1, 'Demande de Tarifs & Grille B2B', 'TARIFS, PRIX, DEVIS, COUT', 'contains', 'all', 'same', 'Grille Tarifaire — {{company}}', 'Bonjour {{name}}, merci pour votre intérêt envers {{company}}. Nos offres entreprise démarrent dès 25 USD/mois avec routes directes Vodacom, Airtel, Orange et Africell. Un conseiller commercial vous recontacte rapidement.', 'Prospect Chaud', true, 4),
         ($1, 'Confirmation de Rendez-vous / Commande', 'CONFIRMER, OUI, OK, VALIDER', 'contains', 'all', 'same', 'Confirmation enregistrée — {{company}}', 'Bonjour {{name}}, votre confirmation auprès de {{company}} a bien été enregistrée. Nous vous remercions pour votre confiance.', 'Confirmé', true, 7),
         ($1, 'Demande de Rappel Téléphonique', 'RAPPEL, ETRE RAPPELE, ÊTRE RAPPELÉ, APPEL', 'contains', 'all', 'same', 'Demande de rappel — {{company}}', 'Bonjour {{name}}, votre demande de rappel a bien été transmise à notre équipe {{company}}. Un conseiller vous contactera sur le {{phone}} dans les plus brefs délais.', 'À rappeler', true, 3),
         ($1, 'Menu d''Assistance & Aide Client', 'INFO, AIDE, HELP, MENU', 'contains', 'all', 'same', 'Assistance — {{company}}', 'Service Client {{company}} : Répondez TARIFS pour recevoir notre grille tarifaire, CONFIRMER pour valider votre dossier, RAPPEL pour être recontacté par un agent, ou STOP pour vous désabonner.', NULL, true, 5)`,
        [t.id]
      );
    }
  }

  // Messages entrants (MO 2-Way) de démonstration si aucun message entrant n'existe
  const inMsgCount = await execQuery("SELECT count(*)::int AS n FROM messages WHERE direction='in'");
  if ((inMsgCount[0]?.n || 0) === 0) {
    const allTenants = await execQuery('SELECT id, name, sender_id FROM tenants');
    for (const t of allTenants) {
      const contacts = await execQuery(
        'SELECT id, name, phone, email FROM contacts WHERE tenant_id=$1 ORDER BY id ASC LIMIT 3',
        [t.id]
      );
      if (contacts[0]) {
        await execQuery(
          `INSERT INTO messages(tenant_id, contact_id, channel, direction, addr, sender_addr, operator, body, status, dlr_code, provider_id, tx_ref, is_read, created_at)
           VALUES($1, $2, 'sms', 'in', $3, $3, 'Vodacom RDC', 'Bonjour, pouvez-vous m''envoyer vos TARIFS entreprise pour Kinshasa ?', 'received', 'MO_INBOUND', 'mo-seed-1', $4, false, now() - interval '25 minutes')`,
          [t.id, contacts[0].id, contacts[0].phone || '+243812345678', `RAY-MO-${t.id}01`]
        );
      }
      if (contacts[1]) {
        await execQuery(
          `INSERT INTO messages(tenant_id, contact_id, channel, direction, addr, sender_addr, operator, body, status, dlr_code, provider_id, tx_ref, is_read, created_at)
           VALUES($1, $2, 'rcs', 'in', $3, $3, 'Airtel RDC (RCS)', 'Être rappelé — Je suis disponible cet après-midi à Lubumbashi.', 'received', 'RBM_REPLY', 'mo-seed-2', $4, false, now() - interval '12 minutes')`,
          [t.id, contacts[1].id, contacts[1].phone || '+243998765432', `RAY-MO-${t.id}02`]
        );
      }
      if (contacts[2]) {
        await execQuery(
          `INSERT INTO messages(tenant_id, contact_id, channel, direction, addr, sender_addr, operator, body, status, dlr_code, provider_id, tx_ref, is_read, created_at)
           VALUES($1, $2, 'whatsapp', 'in', $3, $3, 'WhatsApp Direct', 'Bonjour, je souhaite CONFIRMER la réception de la facture mensuelle. Merci !', 'received', 'WA_INBOUND', 'mo-seed-3', $4, true, now() - interval '2 hours')`,
          [t.id, contacts[2].id, contacts[2].phone || '+243844512893', `RAY-MO-${t.id}03`]
        );
      }
    }
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
