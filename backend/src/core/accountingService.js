import { q, PLAN_PRESETS } from '../db.js';
import { getTenantUsageAndLimits } from '../services/messagingService.js';

export const CHANNELS = ['sms', 'whatsapp', 'rcs', 'email'];

const LIMIT_KEY_MAP = {
  sms: 'maxSms',
  whatsapp: 'maxWhatsapp',
  rcs: 'maxRcs',
  email: 'maxEmails'
};

/**
 * Calcule la comptabilité complète et les soldes restants par canal pour un client
 */
export async function getTenantAccounting(tid) {
  const { tenant, limits, usage } = await getTenantUsageAndLimits(tid);

  const [credRow] = await q(
    'SELECT COALESCE(sum(amount_usd), 0)::float AS total_credited FROM credit_logs WHERE tenant_id=$1',
    [tid]
  );

  const maxSms = Number(limits.maxSms || 0);
  const maxWhatsapp = Number(limits.maxWhatsapp || 0);
  const maxRcs = Number(limits.maxRcs || 0);
  const maxEmails = Number(limits.maxEmails || 0);
  const maxContacts = Number(limits.maxContacts || 0);
  const maxSpendUsd = Number(limits.maxSpendUsd || 0);

  const usedSpendUsd = Number(usage.spendUsd || 0);
  const buyCostUsd = Number(usage.buySpendUsd || 0);
  const remainingSpendUsd = Math.max(0, Number((maxSpendUsd - usedSpendUsd).toFixed(4)));
  const netMarginUsd = Number((usedSpendUsd - buyCostUsd).toFixed(4));

  const quotas = {
    sms: { max: maxSms, used: usage.sms, remaining: Math.max(0, maxSms - usage.sms) },
    whatsapp: { max: maxWhatsapp, used: usage.whatsapp, remaining: Math.max(0, maxWhatsapp - usage.whatsapp) },
    rcs: { max: maxRcs, used: usage.rcs, remaining: Math.max(0, maxRcs - usage.rcs) },
    email: { max: maxEmails, used: usage.email, remaining: Math.max(0, maxEmails - usage.email) },
    contacts: { max: maxContacts, used: usage.contacts, remaining: Math.max(0, maxContacts - usage.contacts) }
  };

  return {
    tenant,
    limits,
    usage,
    quotas,
    financial: {
      currency: 'USD',
      maxSpendUsd,
      usedSpendUsd,
      remainingSpendUsd,
      buyCostUsd,
      netMarginUsd,
      totalCreditedUsd: Number(credRow?.total_credited || 0)
    }
  };
}

/**
 * Vérifie avant un envoi que le client dispose bien du solde restant sur le canal et en USD
 */
export async function assertChannelBalance(tid, channel, quantity = 1) {
  const acct = await getTenantAccounting(tid);
  if (acct.tenant.status === 'suspended') {
    const err = new Error('Compte client suspendu. Contactez l’administration centrale Rayons CRM.');
    err.statusCode = 403;
    throw err;
  }

  const allowed = acct.limits.allowedChannels || CHANNELS;
  if (!allowed.includes(channel)) {
    const err = new Error(`Le canal ${channel.toUpperCase()} n'est pas activé sur votre compte.`);
    err.statusCode = 403;
    throw err;
  }

  const qInfo = acct.quotas[channel];
  if (qInfo && qInfo.remaining < quantity) {
    const err = new Error(
      `Solde ${channel.toUpperCase()} insuffisant (${qInfo.remaining} restant(s) pour ${quantity} requis). Demandez une recharge au C-Panel.`
    );
    err.statusCode = 402;
    throw err;
  }

  if (channel !== 'email' && acct.financial.remainingSpendUsd <= 0) {
    const err = new Error(
      `Budget télécom USD épuisé ($${acct.financial.usedSpendUsd.toFixed(2)} / $${acct.financial.maxSpendUsd.toFixed(2)}). Contactez l’administration centrale.`
    );
    err.statusCode = 402;
    throw err;
  }

  return acct;
}

/**
 * Enregistre une écriture dans le grand livre comptable (accounting_entries)
 */
export async function recordAccountingEntry({
  tenantId,
  entryType,
  channel = 'all',
  quantity = 0,
  amountUsd = 0,
  buyCostUsd = 0,
  paymentMethod = '',
  reference = '',
  note = '',
  actorEmail = ''
}) {
  const marginUsd = Number((Number(amountUsd || 0) - Number(buyCostUsd || 0)).toFixed(4));
  const [entry] = await q(
    `INSERT INTO accounting_entries(
       tenant_id, entry_type, channel, quantity, amount_usd, buy_cost_usd, margin_usd,
       payment_method, reference, note, actor_email
     )
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tenantId,
      entryType,
      channel,
      Math.trunc(Number(quantity || 0)),
      Number(amountUsd || 0),
      Number(buyCostUsd || 0),
      marginUsd,
      paymentMethod || null,
      reference || null,
      note || null,
      actorEmail || null
    ]
  );
  return entry;
}

/**
 * Crédite un client en USD et/ou en packs de messages par canal (SMS, WhatsApp, RCS, Email)
 */
export async function creditTenantAccount({
  tenantId,
  actorEmail = '',
  amountUsd = 0,
  packs = {},
  paymentMethod = 'C-Panel Admin',
  reference = '',
  note = ''
}) {
  const [t] = await q('SELECT * FROM tenants WHERE id=$1', [tenantId]);
  if (!t) {
    const err = new Error('Client introuvable');
    err.statusCode = 404;
    throw err;
  }

  const preset = PLAN_PRESETS[t.plan] || PLAN_PRESETS.business;
  const curLimits = { ...preset, ...(t.limits || {}) };
  const nextLimits = { ...curLimits };

  const addUsd = Math.max(0, Number(amountUsd || 0));
  if (addUsd > 0) {
    nextLimits.maxSpendUsd = Number((Number(curLimits.maxSpendUsd || 0) + addUsd).toFixed(2));
  }

  const addedPacks = {};
  for (const ch of CHANNELS) {
    const qty = Math.max(0, Math.trunc(Number(packs[ch] || 0)));
    if (qty > 0) {
      const k = LIMIT_KEY_MAP[ch];
      nextLimits[k] = Number(curLimits[k] || 0) + qty;
      addedPacks[ch] = qty;
    }
  }

  if (addUsd <= 0 && Object.keys(addedPacks).length === 0) {
    const err = new Error('Indiquez un montant USD ou au moins un pack de messages à créditer.');
    err.statusCode = 400;
    throw err;
  }

  await q('UPDATE tenants SET limits=$1, status=$2 WHERE id=$3', [
    JSON.stringify(nextLimits),
    'active',
    tenantId
  ]);

  const refCode = reference || `CPT-${Date.now().toString().slice(-6)}`;
  const packSummary = Object.entries(addedPacks)
    .map(([ch, qVal]) => `+${qVal} ${ch.toUpperCase()}`)
    .join(', ');
  const fullNote = [note, packSummary].filter(Boolean).join(' • ') || 'Crédit comptable C-Panel';

  if (addUsd > 0) {
    await q(
      `INSERT INTO credit_logs(tenant_id, amount_usd, payment_method, reference, note)
       VALUES($1, $2, $3, $4, $5)`,
      [tenantId, addUsd, paymentMethod, refCode, fullNote]
    );
  }

  const entries = [];
  if (addUsd > 0) {
    entries.push(
      await recordAccountingEntry({
        tenantId,
        entryType: 'credit_usd',
        channel: 'all',
        quantity: 0,
        amountUsd: addUsd,
        buyCostUsd: 0,
        paymentMethod,
        reference: refCode,
        note: fullNote,
        actorEmail
      })
    );
  }

  for (const [ch, qty] of Object.entries(addedPacks)) {
    entries.push(
      await recordAccountingEntry({
        tenantId,
        entryType: 'credit_pack',
        channel: ch,
        quantity: qty,
        amountUsd: 0,
        buyCostUsd: 0,
        paymentMethod,
        reference: refCode,
        note: note || `Attribution pack +${qty} ${ch.toUpperCase()}`,
        actorEmail
      })
    );
  }

  const updated = await getTenantAccounting(tenantId);
  return { ok: true, reference: refCode, addedUsd: addUsd, addedPacks, entries, accounting: updated };
}

/**
 * Synthèse comptable globale pour l'Administration Centrale (C-Panel)
 */
export async function getGlobalAccountingSummary() {
  const clientTenants = await q(`
    SELECT t.*
    FROM tenants t
    WHERE NOT EXISTS (
      SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.role = 'superadmin'
    )
    ORDER BY t.id ASC
  `);

  const totals = {
    totalClients: clientTenants.length,
    activeClients: 0,
    suspendedClients: 0,
    totalCreditedUsd: 0,
    totalRevenueUsd: 0,
    totalBuyCostUsd: 0,
    totalNetMarginUsd: 0,
    channels: {
      sms: { allocated: 0, used: 0, remaining: 0 },
      whatsapp: { allocated: 0, used: 0, remaining: 0 },
      rcs: { allocated: 0, used: 0, remaining: 0 },
      email: { allocated: 0, used: 0, remaining: 0 }
    }
  };

  const clientBalances = [];
  const lowBalanceAlerts = [];

  for (const t of clientTenants) {
    if (t.status === 'suspended') totals.suspendedClients++;
    else totals.activeClients++;

    const acct = await getTenantAccounting(t.id);
    totals.totalCreditedUsd += acct.financial.totalCreditedUsd;
    totals.totalRevenueUsd += acct.financial.usedSpendUsd;
    totals.totalBuyCostUsd += acct.financial.buyCostUsd;
    totals.totalNetMarginUsd += acct.financial.netMarginUsd;

    const allowed = acct.limits.allowedChannels || CHANNELS;
    for (const ch of CHANNELS) {
      totals.channels[ch].allocated += acct.quotas[ch].max;
      totals.channels[ch].used += acct.quotas[ch].used;
      totals.channels[ch].remaining += acct.quotas[ch].remaining;

      if (allowed.includes(ch) && acct.quotas[ch].max > 0) {
        const ratio = acct.quotas[ch].remaining / acct.quotas[ch].max;
        if (ratio <= 0.15) {
          lowBalanceAlerts.push({
            tenantId: t.id,
            company: t.name,
            channel: ch,
            remaining: acct.quotas[ch].remaining,
            max: acct.quotas[ch].max,
            percentRemaining: Math.round(ratio * 100)
          });
        }
      }
    }

    if (acct.financial.maxSpendUsd > 0 && acct.financial.remainingSpendUsd / acct.financial.maxSpendUsd <= 0.15) {
      lowBalanceAlerts.push({
        tenantId: t.id,
        company: t.name,
        channel: 'usd',
        remaining: acct.financial.remainingSpendUsd,
        max: acct.financial.maxSpendUsd,
        percentRemaining: Math.round((acct.financial.remainingSpendUsd / acct.financial.maxSpendUsd) * 100)
      });
    }

    clientBalances.push({
      id: t.id,
      name: t.name,
      plan: t.plan,
      status: t.status,
      senderId: t.sender_id,
      clientId: t.client_id,
      allowedChannels: allowed,
      quotas: acct.quotas,
      financial: acct.financial
    });
  }

  totals.totalCreditedUsd = Number(totals.totalCreditedUsd.toFixed(2));
  totals.totalRevenueUsd = Number(totals.totalRevenueUsd.toFixed(4));
  totals.totalBuyCostUsd = Number(totals.totalBuyCostUsd.toFixed(4));
  totals.totalNetMarginUsd = Number(totals.totalNetMarginUsd.toFixed(4));

  return { totals, clientBalances, lowBalanceAlerts };
}
