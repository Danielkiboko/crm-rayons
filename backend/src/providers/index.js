import nodemailer from 'nodemailer';
import { executeSmppSession } from './smppClient.js';

/**
 * Normalise un numéro RDC au format international E.164 (ex: +243812345678) et MSISDN (243812345678)
 */
export function normalizeDrcMsisdn(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return { msisdn: '', e164: '' };
  if (digits.startsWith('243')) {
    return { msisdn: digits, e164: `+${digits}` };
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    const msisdn = `243${digits.slice(1)}`;
    return { msisdn, e164: `+${msisdn}` };
  }
  if (digits.length === 9 && ['8', '9'].includes(digits[0])) {
    const msisdn = `243${digits}`;
    return { msisdn, e164: `+${msisdn}` };
  }
  return { msisdn: digits, e164: `+${digits}` };
}

/**
 * Détecte automatiquement l'opérateur télécom à partir du numéro (préfixes RDC & internationaux)
 */
export function detectTelecomOperator(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  const local = digits.startsWith('243')
    ? digits.slice(3)
    : digits.startsWith('0')
    ? digits.slice(1)
    : digits;
  const p2 = local.slice(0, 2);

  if (['81', '82', '83'].includes(p2)) return { key: 'vodacom', label: 'Vodacom RDC' };
  if (['97', '98', '99'].includes(p2)) return { key: 'airtel', label: 'Airtel RDC' };
  if (['80', '84', '85', '89'].includes(p2)) return { key: 'orange', label: 'Orange RDC' };
  if (['90', '91'].includes(p2)) return { key: 'africell', label: 'Africell RDC' };
  return { key: 'default', label: 'Passerelle Télécom Directe' };
}

/**
 * Construit les en-têtes HTTP d'authentification selon le type choisi pour l'opérateur
 */
function buildHttpAuthHeaders(route) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const authType = route.authType || 'bearer';

  if (authType === 'basic' && (route.username || route.apiKey)) {
    const raw = `${route.username || ''}:${route.password || route.apiKey || ''}`;
    headers.Authorization = `Basic ${Buffer.from(raw).toString('base64')}`;
  } else if (authType === 'apikey_header' && route.apiKey) {
    headers['X-API-Key'] = route.apiKey;
  } else if (route.apiKey) {
    headers.Authorization = `Bearer ${route.apiKey}`;
  }
  return headers;
}

/**
 * Envoi direct via la route de l'opérateur télécom (SMPP v3.4 / Orange SDP / HTTP REST / HTTP GET)
 */
async function sendViaTelecomRoute(cfg, { to, body, channel, customSenderId, dlrWebhookUrl, metadata = {} }) {
  const start = Date.now();
  const op = detectTelecomOperator(to);
  const { msisdn, e164 } = normalizeDrcMsisdn(to);
  const telecomCfg = cfg?.telecom || {};
  const route = telecomCfg[op.key] || telecomCfg.default || {};

  const senderId =
    customSenderId ||
    (channel === 'rcs'
      ? route.rcsAgent || telecomCfg.rcsAgent || cfg?.rcs?.agentId || 'RAYONS_RCS'
      : route.senderId || telecomCfg.senderId || 'RAYONS');

  const unitCost =
    channel === 'rcs'
      ? Number(route.rcsCost || cfg?.rcs?.cost || 0.02)
      : Number(route.smsCost || 0.015);
  const buyCost =
    channel === 'rcs'
      ? Number(route.rcsBuyCost || cfg?.rcs?.buyCost || 0.012)
      : Number(route.buyCost || 0.009);
  const protocol = route.protocol || 'http_json';
  const mode = route.mode || 'sandbox_dlr'; // 'live' ou 'sandbox_dlr'

  // 1. Protocole SMPP v3.4 Direct (TCP Bind Transceiver + submit_sm)
  if (protocol === 'smpp_v34' && (mode === 'live' || (route.smppHost && route.systemId))) {
    const smppRes = await executeSmppSession(route, {
      senderId,
      to: msisdn,
      body
    });
    return {
      providerId: smppRes.providerId,
      operator: op.label,
      operatorKey: op.key,
      senderAddr: senderId,
      cost: unitCost,
      buyCost,
      latencyMs: smppRes.latencyMs,
      protocol: 'smpp_v34',
      mode: 'live'
    };
  }

  // 2. Protocole Orange RDC SDP (outboundSMSMessageRequest)
  if (protocol === 'orange_sdp' && (mode === 'live' || route.apiKey)) {
    if (!route.gatewayUrl || !route.apiKey) {
      throw new Error(`Configuration Orange RDC SDP incomplète (URL Gateway et Token requis en mode Live)`);
    }
    const senderAddress = `tel:${e164}`;
    const res = await fetch(route.gatewayUrl, {
      method: 'POST',
      headers: buildHttpAuthHeaders(route),
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: [`tel:${e164}`],
          senderAddress,
          senderName: senderId,
          outboundSMSTextMessage: { message: body },
          receiptRequest: dlrWebhookUrl ? { notifyURL: dlrWebhookUrl } : undefined
        }
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        j.requestError?.serviceException?.text ||
          j.error ||
          j.message ||
          `Erreur Orange RDC SDP (HTTP ${res.status})`
      );
    }
    const resourceUrl = j.outboundSMSMessageRequest?.resourceURL || '';
    const extractedId = resourceUrl.split('/').pop() || `orange-${Date.now()}`;
    return {
      providerId: extractedId,
      operator: op.label,
      operatorKey: op.key,
      senderAddr: senderId,
      cost: unitCost,
      buyCost,
      latencyMs: Date.now() - start,
      protocol: 'orange_sdp',
      mode: 'live'
    };
  }

  // 3. Protocole HTTP GET Gateway (Kannel / Jasmin / Africell RDC Gateway)
  if (protocol === 'http_get' && (mode === 'live' || route.apiKey || route.username)) {
    if (!route.gatewayUrl) {
      throw new Error(`URL Gateway HTTP GET manquante pour ${op.label}`);
    }
    const u = new URL(route.gatewayUrl);
    if (route.username) u.searchParams.set('username', route.username);
    if (route.password || route.apiKey) u.searchParams.set('password', route.password || route.apiKey);
    u.searchParams.set('from', senderId);
    u.searchParams.set('to', msisdn);
    u.searchParams.set('text', body);
    if (dlrWebhookUrl) {
      u.searchParams.set('dlr-mask', '31');
      u.searchParams.set('dlr-url', dlrWebhookUrl);
    }
    const res = await fetch(u.toString(), { method: 'GET' });
    const textResp = await res.text();
    if (!res.ok) {
      throw new Error(`Erreur Gateway HTTP GET ${op.label} (HTTP ${res.status}): ${textResp.slice(0, 120)}`);
    }
    return {
      providerId: textResp.trim().slice(0, 64) || `${op.key}-${Date.now()}`,
      operator: op.label,
      operatorKey: op.key,
      senderAddr: senderId,
      cost: unitCost,
      buyCost,
      latencyMs: Date.now() - start,
      protocol: 'http_get',
      mode: 'live'
    };
  }

  // 4. Protocole HTTP REST JSON (Vodacom RDC SDP / Airtel RDC Messaging / Générique)
  if (mode === 'live' || (route.gatewayUrl && (route.apiKey || route.username))) {
    if (!route.gatewayUrl || (!route.apiKey && !route.username)) {
      throw new Error(
        `La route ${op.label} est en mode Production Live mais les identifiants API/SMPP ne sont pas renseignés dans le C-Panel.`
      );
    }
    const res = await fetch(route.gatewayUrl, {
      method: 'POST',
      headers: buildHttpAuthHeaders(route),
      body: JSON.stringify({
        operator: op.key,
        channel,
        from: senderId,
        senderId,
        to: msisdn,
        msisdn,
        e164,
        text: body,
        message: body,
        rcsCard: channel === 'rcs' ? metadata : undefined,
        dlrCallbackUrl: dlrWebhookUrl
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j.error || j.message || `Erreur route télécom ${op.label} (HTTP ${res.status})`);
    }
    return {
      providerId: j.messageId || j.id || j.data?.messageId || `${op.key}-${Date.now()}`,
      operator: op.label,
      operatorKey: op.key,
      senderAddr: senderId,
      cost: unitCost,
      buyCost,
      latencyMs: Date.now() - start,
      protocol: 'http_json',
      mode: 'live'
    };
  }

  // 5. Mode Simulation Réseau Réaliste avec DLR automatique (sandbox_dlr)
  const simulatedLatency = 35 + Math.floor(Math.random() * 55);
  return {
    providerId: `dlr-${op.key}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    operator: op.label,
    operatorKey: op.key,
    senderAddr: senderId,
    cost: unitCost,
    buyCost,
    latencyMs: simulatedLatency,
    protocol,
    mode: 'sandbox_dlr'
  };
}

/**
 * Envoi RCS Business Messaging (RBM / Google Jibe + Opérateurs RDC) avec Carte Riche & Repli SMS
 */
async function sendRcsRichMessage(cfg, { to, subject, body, customSenderId, dlrWebhookUrl, metadata = {} }) {
  const start = Date.now();
  const op = detectTelecomOperator(to);
  const { msisdn, e164 } = normalizeDrcMsisdn(to);
  const rcsCfg = cfg?.rcs || {};
  const telecomCfg = cfg?.telecom || {};
  const route = telecomCfg[op.key] || {};

  const agentId = customSenderId || rcsCfg.agentId || telecomCfg.rcsAgent || 'RAYONS_RCS';
  const unitCost = Number(rcsCfg.cost || route.rcsCost || 0.02);
  const buyCost = Number(rcsCfg.buyCost || route.rcsBuyCost || 0.012);
  const cardTitle = metadata.cardTitle || subject || '';
  const mediaUrl = metadata.mediaUrl || '';
  const ctaLabel = metadata.ctaLabel || '';
  const ctaUrl = metadata.ctaUrl || '';
  const ctaPhone = metadata.ctaPhone || '';
  const quickReplies = Array.isArray(metadata.quickReplies)
    ? metadata.quickReplies
    : String(metadata.quickReplies || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
  const smsFallback = metadata.smsFallback !== false;

  // Construction du payload standard Google RBM / GSMA UP 2.4
  const suggestions = [];
  if (ctaLabel && ctaUrl) {
    suggestions.push({
      action: {
        text: ctaLabel.slice(0, 25),
        postbackData: `url:${ctaUrl}`,
        openUrlAction: { url: ctaUrl }
      }
    });
  }
  if (ctaPhone) {
    suggestions.push({
      action: {
        text: metadata.ctaPhoneLabel || 'Appeler',
        postbackData: `dial:${ctaPhone}`,
        dialAction: { phoneNumber: ctaPhone }
      }
    });
  }
  for (const qr of quickReplies.slice(0, 4)) {
    suggestions.push({
      reply: {
        text: qr.slice(0, 25),
        postbackData: `reply:${qr}`
      }
    });
  }

  const rbmPayload =
    cardTitle || mediaUrl
      ? {
          contentMessage: {
            richCard: {
              standaloneCard: {
                cardOrientation: 'VERTICAL',
                cardContent: {
                  title: cardTitle || undefined,
                  description: body,
                  media: mediaUrl
                    ? {
                        height: 'MEDIUM',
                        contentInfo: { fileUrl: mediaUrl, forceRefresh: false }
                      }
                    : undefined,
                  suggestions: suggestions.length > 0 ? suggestions : undefined
                }
              }
            }
          }
        }
      : {
          contentMessage: {
            text: body,
            suggestions: suggestions.length > 0 ? suggestions : undefined
          }
        };

  // Si une passerelle RBM Live est configurée avec clé API
  if (route.mode === 'live' && (rcsCfg.apiKey || route.apiKey)) {
    try {
      const targetUrl =
        rcsCfg.jibeGatewayUrl || route.gatewayUrl || `https://rbm.googleapis.com/v1/phones/${e164}/agentMessages`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rcsCfg.apiKey || route.apiKey}`
        },
        body: JSON.stringify({
          agentId,
          msisdn,
          e164,
          smsFallback,
          dlrCallbackUrl: dlrWebhookUrl,
          ...rbmPayload
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || `Erreur RBM HTTP ${res.status}`);
      return {
        providerId: j.name || j.messageId || `rcs-${op.key}-${Date.now()}`,
        operator: `${op.label} (RCS)`,
        operatorKey: op.key,
        senderAddr: agentId,
        cost: unitCost,
        buyCost,
        latencyMs: Date.now() - start,
        protocol: 'gsma_rcs_rbm',
        mode: 'live',
        rbmPayload
      };
    } catch (err) {
      // Si le repli SMS automatique est activé, basculer sur la route SMS de l'opérateur
      if (smsFallback) {
        const fallbackBody = [cardTitle, body, ctaUrl].filter(Boolean).join(' — ');
        const smsOut = await sendViaTelecomRoute(cfg, {
          to,
          body: fallbackBody,
          channel: 'sms',
          customSenderId: agentId.slice(0, 11),
          dlrWebhookUrl
        });
        return {
          ...smsOut,
          operator: `${op.label} (Repli SMS)`,
          protocol: 'rcs_sms_fallback'
        };
      }
      throw err;
    }
  }

  // Mode Sandbox RCS Vérifié avec accusé de lecture RBM automatique
  const simulatedLatency = 38 + Math.floor(Math.random() * 45);
  return {
    providerId: `rcs-${op.key}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    operator: `${op.label} (RCS)`,
    operatorKey: op.key,
    senderAddr: agentId,
    cost: unitCost,
    buyCost,
    latencyMs: simulatedLatency,
    protocol: 'gsma_rcs_rbm',
    mode: 'sandbox_dlr',
    rbmPayload
  };
}

/**
 * Teste la connectivité d'une route opérateur depuis le C-Panel
 */
export async function testTelecomRoute(cfg, opKey) {
  const start = Date.now();
  const telecomCfg = cfg?.telecom || {};
  const route = telecomCfg[opKey] || {};
  const protocol = route.protocol || 'http_json';
  const mode = route.mode || 'sandbox_dlr';

  if (mode === 'sandbox_dlr' && !route.apiKey && !route.smppHost && !route.username) {
    return {
      ok: true,
      mode: 'sandbox_dlr',
      protocol,
      latencyMs: 28,
      message: `Route ${opKey.toUpperCase()} prête en mode Bac à sable + Accusé DLR automatique (ajoutez vos clés ou hôte SMPP pour basculer en Production Live).`
    };
  }

  if (protocol === 'smpp_v34') {
    const res = await executeSmppSession(route, null, 5000);
    return {
      ok: true,
      mode: 'live',
      protocol: 'smpp_v34',
      latencyMs: res.latencyMs,
      message: `Bind SMPP v3.4 réussi sur ${route.smppHost}:${route.smppPort || 2775} (System ID : ${res.systemId})`
    };
  }

  if (!route.gatewayUrl) {
    throw new Error('URL Gateway manquante');
  }

  const res = await fetch(route.gatewayUrl, {
    method: protocol === 'http_get' ? 'GET' : 'OPTIONS',
    headers: buildHttpAuthHeaders(route)
  }).catch(err => {
    throw new Error(`Passerelle HTTP injoignable (${route.gatewayUrl}) : ${err.message}`);
  });

  return {
    ok: true,
    mode: 'live',
    protocol,
    httpStatus: res.status,
    latencyMs: Date.now() - start,
    message: `Passerelle HTTP ${opKey.toUpperCase()} joignable (HTTP ${res.status} en ${Date.now() - start} ms)`
  };
}

/**
 * Détecte automatiquement les paramètres SMTP (serveur, port, sécurité, fournisseur)
 * à partir de l'adresse email avec laquelle le client s'est inscrit
 */
export function resolveSmtpConfig(email = '', mailCfg = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const domain = (cleanEmail.split('@')[1] || '').toLowerCase();

  let detectedHost = '';
  let detectedPort = 587;
  let providerLabel = 'Serveur SMTP Domaine Pro';

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    detectedHost = 'smtp.gmail.com';
    detectedPort = 465;
    providerLabel = 'Google Workspace / Gmail';
  } else if (['outlook.com', 'hotmail.com', 'live.com', 'office365.com', 'msn.com'].includes(domain)) {
    detectedHost = 'smtp.office365.com';
    detectedPort = 587;
    providerLabel = 'Microsoft 365 / Outlook';
  } else if (domain.startsWith('yahoo.')) {
    detectedHost = 'smtp.mail.yahoo.com';
    detectedPort = 465;
    providerLabel = 'Yahoo Mail';
  } else if (domain === 'zoho.com' || domain === 'zohomail.com') {
    detectedHost = 'smtp.zoho.com';
    detectedPort = 465;
    providerLabel = 'Zoho Mail Pro';
  } else if (domain === 'icloud.com' || domain === 'me.com') {
    detectedHost = 'smtp.mail.me.com';
    detectedPort = 587;
    providerLabel = 'Apple iCloud Mail';
  } else if (domain) {
    detectedHost = `smtp.${domain}`;
    detectedPort = 587;
    providerLabel = `Domaine Entreprise (${domain})`;
  }

  const host = (mailCfg.host || '').trim() || detectedHost;
  const port = Number(mailCfg.port || detectedPort || 587);
  const secure = port === 465;
  const pass = (mailCfg.appPassword || mailCfg.pass || '').trim();
  const fromName = (mailCfg.fromName || '').trim();
  const replyTo = (mailCfg.replyTo || '').trim() || cleanEmail;
  const signature = (mailCfg.signature || '').trim();

  return {
    accountEmail: cleanEmail,
    domain,
    providerLabel,
    host,
    port,
    secure,
    hasPassword: Boolean(pass),
    pass,
    fromName,
    replyTo,
    signature
  };
}

/**
 * Construit un email HTML responsive et soigné avec bouton d'action (CTA), signature,
 * lien de désabonnement et pixel de suivi d'ouverture
 */
export function buildRichEmailHtml({
  subject,
  body = '',
  companyName = 'Rayons CRM',
  fromName = '',
  userEmail = '',
  signature = '',
  metadata = {},
  txRef = '',
  baseUrl = 'http://localhost:4000',
  tenantId = 1,
  recipientEmail = ''
}) {
  const displayBrand = fromName || companyName || 'Rayons CRM';
  const accentColor = metadata?.accentColor || '#1d4ed8';
  const badgeText = metadata?.badgeText || '';
  const cardTitle = metadata?.cardTitle || '';
  const rawMediaUrl = metadata?.mediaUrl || '';
  const mediaUrl = rawMediaUrl.startsWith('/') ? `${baseUrl}${rawMediaUrl}` : rawMediaUrl;

  const isAlreadyHtml = /<(html|body|table|div|p|h1|h2|br)\b/i.test(body);
  const formattedBody = isAlreadyHtml
    ? body
    : String(body)
        .split('\n')
        .map(line =>
          line.trim()
            ? `<p style="margin:0 0 12px 0;line-height:1.65;color:#18181b;font-size:15px;">${line}</p>`
            : '<div style="height:8px;"></div>'
        )
        .join('');

  const ctaLabel = metadata?.ctaLabel || '';
  const ctaUrl = metadata?.ctaUrl || '';

  const heroMediaBlock = mediaUrl
    ? `<div style="width:100%;background:#09090b;text-align:center;overflow:hidden;border-bottom:1px solid #e4e4e7;">
         ${ctaUrl ? `<a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">` : ''}
           <img src="${mediaUrl}" alt="${cardTitle || subject || displayBrand}" style="width:100%;max-width:600px;max-height:260px;object-fit:cover;display:block;margin:0 auto;border:0;" />
         ${ctaUrl ? '</a>' : ''}
       </div>`
    : '';

  const titleAndBadgeBlock =
    badgeText || cardTitle
      ? `<div style="margin-bottom:16px;">
           ${
             badgeText
               ? `<span style="display:inline-block;padding:3px 10px;border-radius:99px;background:${accentColor}18;color:${accentColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${badgeText}</span>`
               : ''
           }
           ${
             cardTitle
               ? `<h1 style="margin:0;font-size:20px;line-height:1.3;color:#09090b;font-weight:700;letter-spacing:-0.02em;">${cardTitle}</h1>`
               : ''
           }
         </div>`
      : '';

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `<div style="margin:24px 0 8px 0;">
           <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;">
             ${ctaLabel}
           </a>
         </div>`
      : '';

  const sigBlock = signature
    ? `<div style="margin-top:22px;padding-top:14px;border-top:1px solid #e4e4e7;color:#52525b;font-size:13px;white-space:pre-line;">${signature}</div>`
    : '';

  const unsubUrl = `${baseUrl}/webhooks/email/unsubscribe?tid=${encodeURIComponent(tenantId)}&email=${encodeURIComponent(recipientEmail)}`;
  const openPixelUrl = txRef
    ? `${baseUrl}/webhooks/email/open/${encodeURIComponent(txRef)}.gif`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subject || displayBrand}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;">
    <div style="padding:16px 24px;background:#18181b;color:#ffffff;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accentColor};">
      <strong style="font-size:15px;letter-spacing:-0.01em;">${displayBrand}</strong>
      <span style="font-size:12px;color:#a1a1aa;">${userEmail}</span>
    </div>
    ${heroMediaBlock}
    <div style="padding:24px;">
      ${titleAndBadgeBlock}
      ${formattedBody}
      ${ctaBlock}
      ${sigBlock}
    </div>
    <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#71717a;display:flex;justify-content:space-between;align-items:center;">
      <span>Envoyé par ${displayBrand} (${userEmail})</span>
      <a href="${unsubUrl}" style="color:#71717a;text-decoration:underline;">Se désabonner</a>
    </div>
  </div>
  ${openPixelUrl ? `<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:none;" />` : ''}
</body>
</html>`;
}

/**
 * Teste la connexion SMTP du compte email client (et envoie un email de test si demandé)
 */
export async function testEmailConnection(cfg, { userEmail, companyName, testRecipient, sendTestMail = false }) {
  const start = Date.now();
  const mailCfg = cfg?.emailDirect || cfg?.smtp || {};
  const smtp = resolveSmtpConfig(userEmail, mailCfg);

  if (smtp.hasPassword && smtp.host) {
    const tr = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.accountEmail, pass: smtp.pass },
      connectionTimeout: 6000,
      greetingTimeout: 6000
    });

    await tr.verify();

    let messageId = null;
    if (sendTestMail) {
      const target = testRecipient || smtp.accountEmail;
      const displayFrom = `${smtp.fromName || companyName || 'Rayons CRM'} <${smtp.accountEmail}>`;
      const html = buildRichEmailHtml({
        subject: `Test de connexion Email Direct — ${companyName || 'Rayons CRM'}`,
        body: `Bonjour,\n\nVotre compte email (${smtp.accountEmail}) est correctement connecté à Rayons CRM via le serveur ${smtp.host}:${smtp.port}.\n\nTous vos envois d'emails unitaires et en masse partiront directement avec votre identité.`,
        companyName,
        fromName: smtp.fromName,
        userEmail: smtp.accountEmail,
        signature: smtp.signature,
        recipientEmail: target
      });
      const info = await tr.sendMail({
        from: displayFrom,
        replyTo: smtp.replyTo,
        to: target,
        subject: `Test de connexion Email Direct — ${companyName || 'Rayons CRM'}`,
        html,
        text: `Votre compte email (${smtp.accountEmail}) est connecté à Rayons CRM via ${smtp.host}:${smtp.port}.`
      });
      messageId = info.messageId;
    }

    return {
      ok: true,
      mode: 'live_smtp',
      providerLabel: smtp.providerLabel,
      accountEmail: smtp.accountEmail,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      latencyMs: Date.now() - start,
      messageId,
      message: sendTestMail
        ? `Handshake SMTP réussi et email de test envoyé depuis ${smtp.accountEmail} via ${smtp.host}:${smtp.port}.`
        : `Authentification SMTP directe vérifiée pour ${smtp.accountEmail} sur ${smtp.host}:${smtp.port} (${smtp.providerLabel}).`
    };
  }

  // Mode Relais Direct / Bac à sable vérifié (sans mot de passe d'application externe)
  return {
    ok: true,
    mode: 'direct_relay',
    providerLabel: smtp.providerLabel,
    accountEmail: smtp.accountEmail,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    latencyMs: 24,
    message: `Identité d'expédition active : ${smtp.fromName || companyName || 'Rayons CRM'} <${smtp.accountEmail}> (Serveur détecté : ${smtp.host}:${smtp.port}). Renseignez votre mot de passe d'application SMTP pour activer le transport TLS direct.`
  };
}

export const senders = {
  sms: (cfg, payload) => sendViaTelecomRoute(cfg, { ...payload, channel: 'sms' }),

  rcs: (cfg, payload) => sendRcsRichMessage(cfg, payload),

  async whatsapp(cfg, { to, body, template }) {
    const start = Date.now();
    const w = cfg?.whatsapp;
    const senderAddr = w?.phoneId || 'WhatsApp Business';
    const cost = Number(w?.cost || 0.008);
    const buyCost = Number(w?.buyCost || 0.005);

    if (!w?.phoneId || !w?.token) {
      return {
        providerId: `wa-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        operator: 'WhatsApp Direct',
        operatorKey: 'whatsapp',
        senderAddr,
        cost,
        buyCost,
        latencyMs: 42,
        protocol: 'meta_cloud_api',
        mode: 'sandbox_dlr'
      };
    }

    const { msisdn } = normalizeDrcMsisdn(to);
    const payload = template
      ? { type: 'template', template: { name: template, language: { code: 'fr' } } }
      : { type: 'text', text: { body } };
    const res = await fetch(`https://graph.facebook.com/v20.0/${w.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: msisdn, ...payload })
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message || 'Erreur WhatsApp');
    return {
      providerId: j.messages?.[0]?.id || `wa-${Date.now()}`,
      operator: 'WhatsApp Direct',
      operatorKey: 'whatsapp',
      senderAddr,
      cost,
      buyCost,
      latencyMs: Date.now() - start,
      protocol: 'meta_cloud_api',
      mode: 'live'
    };
  },

  async email(cfg, { to, subject, body, userEmail, companyName, metadata = {}, txRef = '', tenantId = 1 }) {
    const start = Date.now();
    const mailCfg = cfg?.emailDirect || cfg?.smtp || {};
    const smtp = resolveSmtpConfig(userEmail || mailCfg.user || 'danielkiboko218@gmail.com', mailCfg);
    const displayBrand = smtp.fromName || companyName || '';
    const displayFrom = displayBrand ? `${displayBrand} <${smtp.accountEmail}>` : smtp.accountEmail;
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:4000';

    const richHtml = buildRichEmailHtml({
      subject: subject || '(sans objet)',
      body,
      companyName,
      fromName: smtp.fromName,
      userEmail: smtp.accountEmail,
      signature: smtp.signature,
      metadata,
      txRef,
      baseUrl,
      tenantId,
      recipientEmail: to
    });

    if (smtp.host && smtp.hasPassword) {
      const tr = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.accountEmail, pass: smtp.pass }
      });
      const unsubUrl = `${baseUrl}/webhooks/email/unsubscribe?tid=${encodeURIComponent(tenantId)}&email=${encodeURIComponent(to)}`;
      const info = await tr.sendMail({
        from: displayFrom,
        replyTo: smtp.replyTo,
        to,
        subject: subject || '(sans objet)',
        html: richHtml,
        text: `${body.replace(/<[^>]+>/g, '')}${smtp.signature ? `\n\n${smtp.signature}` : ''}`,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`
        }
      });
      return {
        providerId: info.messageId,
        operator: `Email Direct (${smtp.accountEmail})`,
        operatorKey: 'smtp',
        senderAddr: smtp.accountEmail,
        cost: 0,
        buyCost: 0,
        latencyMs: Date.now() - start,
        protocol: 'smtp_tls',
        mode: 'live'
      };
    }

    return {
      providerId: `mail-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      operator: `Email Direct (${smtp.accountEmail})`,
      operatorKey: 'smtp',
      senderAddr: smtp.accountEmail,
      cost: 0,
      buyCost: 0,
      latencyMs: 26,
      protocol: 'smtp_relay',
      mode: 'sandbox_dlr'
    };
  }
};
