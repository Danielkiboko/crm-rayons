import { q, DEFAULT_TELECOM_SETTINGS } from '../db.js';
import { getMasterSettings } from '../services/messagingService.js';
import { CHANNELS, getTenantAccounting } from './accountingService.js';

const registeredServices = new Map();

export function registerChannelService(channel, serviceObj) {
  registeredServices.set(channel, serviceObj);
}

export function getChannelService(channel) {
  const svc = registeredServices.get(channel);
  if (!svc) throw new Error(`Backend canal "${channel}" non enregistré`);
  return svc;
}

/**
 * Retourne la configuration globale des 4 backends canaux (ON/OFF, passerelles, stats)
 */
export async function getCentralChannelsStatus() {
  const master = await getMasterSettings();
  const channelFlags = {
    ...DEFAULT_TELECOM_SETTINGS.channels,
    ...(master.channels || {})
  };

  const statsRows = await q(`
    SELECT
      channel,
      count(*) FILTER (WHERE direction='out')::int AS sent_total,
      count(*) FILTER (WHERE direction='out' AND status='delivered')::int AS delivered_total,
      count(*) FILTER (WHERE direction='out' AND status='failed')::int AS failed_total,
      count(*) FILTER (WHERE direction='in')::int AS inbound_total,
      COALESCE(sum(cost), 0)::float AS revenue_usd,
      COALESCE(sum(buy_cost), 0)::float AS buy_cost_usd
    FROM messages
    GROUP BY channel
  `);

  const byChannel = Object.fromEntries(statsRows.map(r => [r.channel, r]));

  const descriptions = {
    sms: {
      label: 'SMS Télécom',
      backendModule: 'backend/src/channels/sms',
      endpointBase: '/api/channels/sms',
      gatewayInfo: 'Routes directes Vodacom, Airtel, Orange & Africell RDC'
    },
    whatsapp: {
      label: 'WhatsApp Business',
      backendModule: 'backend/src/channels/whatsapp',
      endpointBase: '/api/channels/whatsapp',
      gatewayInfo: master.whatsapp?.phoneId ? 'Meta Cloud API connectée' : 'Relais WhatsApp Business'
    },
    rcs: {
      label: 'RCS Opérateur',
      backendModule: 'backend/src/channels/rcs',
      endpointBase: '/api/channels/rcs',
      gatewayInfo: `Agent ${master.rcs?.agentId || 'RAYONS_RCS_CD'} (Fallback SMS ${master.rcs?.smsFallback !== false ? 'actif' : 'inactif'})`
    },
    email: {
      label: 'Email Direct',
      backendModule: 'backend/src/channels/email',
      endpointBase: '/api/channels/email',
      gatewayInfo: process.env.SMTP_HOST || master.emailDirect?.host || 'SMTP Direct / TLS'
    }
  };

  return CHANNELS.map(ch => {
    const flag = channelFlags[ch] || { enabled: true, maintenanceNote: '' };
    const st = byChannel[ch] || {};
    const sent = st.sent_total || 0;
    const delivered = st.delivered_total || 0;
    return {
      channel: ch,
      ...descriptions[ch],
      enabled: flag.enabled !== false,
      maintenanceNote: flag.maintenanceNote || '',
      registered: registeredServices.has(ch),
      metrics: {
        sent,
        delivered,
        failed: st.failed_total || 0,
        inbound: st.inbound_total || 0,
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 100,
        revenueUsd: Number(st.revenue_usd || 0),
        buyCostUsd: Number(st.buy_cost_usd || 0)
      }
    };
  });
}

/**
 * Active ou désactive un backend canal au niveau global depuis le C-Panel
 */
export async function toggleChannelGlobal(channel, { enabled, maintenanceNote = '' }) {
  if (!CHANNELS.includes(channel)) {
    const err = new Error(`Canal inconnu : ${channel}`);
    err.statusCode = 400;
    throw err;
  }

  const [masterTenant] = await q(
    `SELECT t.id, t.settings FROM tenants t
     JOIN users u ON u.tenant_id = t.id
     WHERE u.role = 'superadmin'
     ORDER BY t.id ASC LIMIT 1`
  );
  if (!masterTenant) throw new Error('Compte Master C-Panel introuvable');

  const curSettings = masterTenant.settings || {};
  const curChannels = { ...DEFAULT_TELECOM_SETTINGS.channels, ...(curSettings.channels || {}) };
  curChannels[channel] = {
    enabled: Boolean(enabled),
    maintenanceNote: String(maintenanceNote || '').trim()
  };

  const nextSettings = { ...curSettings, channels: curChannels };
  await q('UPDATE tenants SET settings=$1 WHERE id=$2', [JSON.stringify(nextSettings), masterTenant.id]);

  return curChannels[channel];
}

/**
 * Vérifie qu'un canal est actif à la fois globalement (C-Panel) et pour le client donné
 */
export async function assertChannelEnabled(tenantId, channel) {
  if (!CHANNELS.includes(channel)) {
    const err = new Error(`Canal non supporté : ${channel}`);
    err.statusCode = 400;
    throw err;
  }

  const master = await getMasterSettings();
  const globalCfg = (master.channels && master.channels[channel]) || { enabled: true, maintenanceNote: '' };
  if (globalCfg.enabled === false) {
    const note = globalCfg.maintenanceNote ? ` (${globalCfg.maintenanceNote})` : '';
    const err = new Error(
      `Le service ${channel.toUpperCase()} est temporairement désactivé par l'administration centrale${note}.`
    );
    err.statusCode = 503;
    throw err;
  }

  const acct = await getTenantAccounting(tenantId);
  const allowed = acct.limits.allowedChannels || CHANNELS;
  if (!allowed.includes(channel)) {
    const err = new Error(
      `Le canal ${channel.toUpperCase()} n'est pas activé pour votre compte. Contactez l'administrateur C-Panel.`
    );
    err.statusCode = 403;
    throw err;
  }

  return { master, acct };
}
