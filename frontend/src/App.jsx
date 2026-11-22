import { useEffect, useState, useCallback } from 'react';

const API =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? window.location.origin
    : 'http://localhost:4000');

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(API + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (localStorage.token || '')
    },
    body: body && JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && localStorage.token) {
    localStorage.removeItem('token');
    location.reload();
  }
  if (!r.ok) throw new Error(j.error || 'Erreur serveur');
  return j;
}

const CH = {
  sms: 'SMS Télécom',
  whatsapp: 'WhatsApp',
  rcs: 'RCS Opérateur',
  email: 'Email Direct'
};

const STATUS_LABEL = {
  sent: 'Envoyé',
  received: 'Reçu',
  delivered: 'Distribué',
  queued: 'En attente',
  failed: 'Échec'
};

export function detectOperatorLabel(phone = '') {
  const digits = (phone || '').replace(/\D/g, '');
  const local = digits.startsWith('243')
    ? digits.slice(3)
    : digits.startsWith('0')
    ? digits.slice(1)
    : digits;
  const p2 = local.slice(0, 2);
  if (['81', '82', '83'].includes(p2)) return 'Vodacom RDC';
  if (['97', '98', '99'].includes(p2)) return 'Airtel RDC';
  if (['80', '84', '85', '89'].includes(p2)) return 'Orange RDC';
  if (['90', '91'].includes(p2)) return 'Africell RDC';
  return digits ? 'Route Télécom' : '';
}

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || 'R';

/* ---------- Minimal Vector Icons (Zero Emojis) ---------- */
function Icon({ name }) {
  const props = {
    className: 'icon-svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.75',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };
  switch (name) {
    case 'dash':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'clients':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'billing':
      return (
        <svg {...props}>
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case 'routes':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
        </svg>
      );
    case 'contacts':
      return (
        <svg {...props}>
          <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      );
    case 'templates':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
    case 'transactions':
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      );
    case 'mass':
      return (
        <svg {...props}>
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...props}>
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    default:
      return null;
  }
}

const ChannelBadge = ({ c }) => <span className={`badge ${c}`}>{CH[c] || c}</span>;

const StatusIndicator = ({ status }) => (
  <span className={`status-pill ${status || 'queued'}`}>
    <span className="status-dot" />
    {STATUS_LABEL[status] || status}
  </span>
);

function QuotaItem({ label, used = 0, max = 1, unit = '', color = 'var(--primary)' }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const near = pct >= 85;
  return (
    <div className="quota-item">
      <div className="quota-top">
        <strong>{label}</strong>
        <span className={near ? 'err-text' : ''}>
          {unit === '$'
            ? `$${Number(used).toFixed(2)} / $${max}`
            : `${used} / ${max}${unit ? ' ' + unit : ''}`}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-bar"
          style={{ width: `${pct}%`, background: near ? 'var(--danger)' : color }}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 * AUTHENTICATION (AVEC CHOIX EXPLICITE : PARTIE C-PANEL vs PARTIE CLIENT)
 * ========================================================================== */
function Login({ onDone }) {
  const [portalChoice, setPortalChoice] = useState('cpanel'); // 'cpanel' | 'client'
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({
    company: '',
    email: 'admin@rayons.cd',
    password: 'admin1234'
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const set = k => e => setF({ ...f, [k]: e.target.value });

  const switchPortal = target => {
    setPortalChoice(target);
    setErr('');
    if (target === 'cpanel') {
      setMode('login');
      setF({ company: '', email: 'admin@rayons.cd', password: 'admin1234' });
    } else {
      setF({ company: '', email: 'client@kivutech.cd', password: 'client1234' });
    }
  };

  const submit = async customBody => {
    setErr('');
    setLoading(true);
    try {
      const payload = customBody || f;
      const r = await api(`/auth/${mode}`, { method: 'POST', body: payload });
      localStorage.token = r.token;
      localStorage.userEmail = r.email || payload.email;
      localStorage.userRole = r.role || 'client';
      localStorage.removeItem('adminTokenBackup');
      onDone(r.role === 'superadmin' && portalChoice === 'cpanel' ? 'cpanel' : 'client');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (email, password, targetPortal) => {
    setMode('login');
    setPortalChoice(targetPortal);
    setF(prev => ({ ...prev, email, password }));
    setErr('');
    setLoading(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.token = r.token;
      localStorage.userEmail = r.email || email;
      localStorage.userRole = r.role || 'client';
      localStorage.removeItem('adminTokenBackup');
      onDone(targetPortal);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-aside">
        <div className="brand-lockup">
          <div className="brand-mark-box">R</div>
          <span>Rayons CRM</span>
        </div>

        <div className="auth-pitch">
          <span className="auth-eyebrow">Architecture SaaS à Deux Portails</span>
          <h1>Une console C-Panel pour l'administrateur, un espace CRM dédié pour chaque client.</h1>
          <p>
            Rayons CRM sépare strictement l'administration de votre infrastructure télécom
            (C-Panel) et l'application quotidienne utilisée par vos entreprises clientes
            (Espace Client).
          </p>
          <div className="auth-features">
            <div className="auth-feature-item">
              <strong>1. Partie C-Panel (Admin SaaS)</strong>
              <span>Création de clients, attribution des quotas, rechargement de crédits et routes télécoms maîtresses</span>
            </div>
            <div className="auth-feature-item">
              <strong>2. Partie Client (Espace CRM)</strong>
              <span>Import CSV de contacts, ciblage par opérateur/segment, modèles de messages, email direct et clé API</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          Rayons CRM — C-Panel SaaS & Portail Client
        </div>
      </div>

      <div className="auth-main">
        <div className="auth-box">
          <div className="segmented" style={{ marginTop: 0, marginBottom: 18 }}>
            <button
              type="button"
              className={portalChoice === 'cpanel' ? 'active' : ''}
              onClick={() => switchPortal('cpanel')}
            >
              1. Partie C-Panel (Admin)
            </button>
            <button
              type="button"
              className={portalChoice === 'client' ? 'active' : ''}
              onClick={() => switchPortal('client')}
            >
              2. Partie Client (CRM)
            </button>
          </div>

          <h2>
            {portalChoice === 'cpanel'
              ? 'Console C-Panel Administrateur'
              : mode === 'login'
              ? 'Espace Client CRM'
              : 'Inscription nouveau client'}
          </h2>
          <p className="mute" style={{ marginTop: 4, fontSize: 13 }}>
            {portalChoice === 'cpanel'
              ? 'Gérez vos comptes clients, leurs quotas, la facturation et vos routes télécoms.'
              : 'Envoyez vos campagnes SMS, WhatsApp, RCS et Email dans le respect de votre forfait.'}
          </p>

          {portalChoice === 'client' && (
            <div className="segmented">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => {
                  setMode('login');
                  setErr('');
                }}
              >
                Connexion Client
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'active' : ''}
                onClick={() => {
                  setMode('register');
                  setErr('');
                }}
              >
                Créer un compte
              </button>
            </div>
          )}

          <form
            style={{ marginTop: portalChoice === 'cpanel' ? 18 : 0 }}
            onSubmit={e => {
              e.preventDefault();
              submit();
            }}
          >
            {mode === 'register' && portalChoice === 'client' && (
              <div className="field">
                <label>Nom de l'entreprise</label>
                <input
                  placeholder="Ex. Kivu Digital SARL"
                  value={f.company}
                  onChange={set('company')}
                  required
                />
              </div>
            )}
            <div className="field">
              <label>Adresse email</label>
              <input
                placeholder="nom@entreprise.cd"
                type="email"
                value={f.email}
                onChange={set('email')}
                required
              />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <input
                placeholder="8 caractères minimum"
                type="password"
                value={f.password}
                onChange={set('password')}
                required
              />
            </div>

            {err && (
              <div className="notice err" style={{ marginBottom: 14 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              className="primary"
              style={{ width: '100%', padding: '9px 14px' }}
              disabled={loading}
            >
              {loading
                ? 'Authentification…'
                : portalChoice === 'cpanel'
                ? 'Ouvrir la Console C-Panel'
                : mode === 'login'
                ? 'Ouvrir l’Espace Client'
                : 'Créer mon Espace Client'}
            </button>
          </form>

          <div className="quick-accounts">
            <div className="quick-accounts-title">Accès directs aux 2 parties</div>
            <div className="quick-account-row">
              <div>
                <strong>Partie 1 — Console C-Panel (Super-Admin)</strong>
                <div className="mute mono">admin@rayons.cd</div>
              </div>
              <button
                type="button"
                className="sm primary"
                onClick={() => quickLogin('admin@rayons.cd', 'admin1234', 'cpanel')}
              >
                Ouvrir C-Panel
              </button>
            </div>
            <div className="quick-account-row">
              <div>
                <strong>Partie 2 — Espace Client (Kivu Tech — Business)</strong>
                <div className="mute mono">client@kivutech.cd</div>
              </div>
              <button
                type="button"
                className="sm"
                onClick={() => quickLogin('client@kivutech.cd', 'client1234', 'client')}
              >
                Espace Client 1
              </button>
            </div>
            <div className="quick-account-row">
              <div>
                <strong>Partie 2 — Espace Client (Horizon — Starter)</strong>
                <div className="mute mono">contact@horizon.cd</div>
              </div>
              <button
                type="button"
                className="sm"
                onClick={() => quickLogin('contact@horizon.cd', 'client1234', 'client')}
              >
                Espace Client 2
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * PARTIE 1 : COMPOSANTS DE LA CONSOLE C-PANEL (ADMINISTRATION SAAS)
 * ========================================================================== */

function CPanelDashboard({ onNavigate }) {
  const [s, setS] = useState(null);
  const [clientsData, setClientsData] = useState({ clients: [] });

  useEffect(() => {
    api('/stats?allTenants=1').then(setS).catch(console.error);
    api('/admin/clients').then(setClientsData).catch(console.error);
  }, []);

  if (!s) return <div className="card mute">Chargement de la supervision C-Panel…</div>;

  const totals = s.totals || {
    total_tx: 0,
    success_tx: 0,
    delivered_tx: 0,
    failed_tx: 0,
    out_tx: 0,
    in_tx: 0,
    total_cost: 0,
    total_buy_cost: 0,
    avg_latency_ms: 38
  };
  const successRate =
    totals.total_tx > 0 ? Math.round((totals.success_tx / totals.total_tx) * 100) : 100;
  const activeClients = clientsData.clients.filter(c => c.status !== 'suspended').length;
  const netMarginUsd = Number(totals.total_cost || 0) - Number(totals.total_buy_cost || 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Supervision Globale — C-Panel SaaS</h2>
          <p>
            Vue consolidée de tous vos comptes clients, de la marge télécom et des accusés de réception opérateurs (DLR).
          </p>
        </div>
        <div className="row">
          <button onClick={() => onNavigate('cpanel-routes')}>Passerelles & DLR</button>
          <button onClick={() => onNavigate('cpanel-billing')}>Recharger un client</button>
          <button className="primary" onClick={() => onNavigate('cpanel-clients')}>
            Gérer les comptes clients
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">
            <span>Comptes clients SaaS</span>
          </div>
          <div className="metric-value">{clientsData.clients.length}</div>
          <div className="metric-foot">
            <span>Actifs : {activeClients}</span>
            <span>Contacts totaux : {s.contacts}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Transactions & DLR</span>
          </div>
          <div className="metric-value">{totals.total_tx}</div>
          <div className="metric-foot">
            <span>Livrés (DLR) : {totals.delivered_tx || 0}</span>
            <span>Entrants (MO) : {totals.in_tx}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Délivrabilité & Latence</span>
          </div>
          <div className="metric-value">{successRate}%</div>
          <div className="metric-foot">
            <span>Latence moy. : {totals.avg_latency_ms || 38} ms</span>
            <span className={totals.failed_tx > 0 ? 'err-text' : ''}>
              Échecs : {totals.failed_tx}
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Revenu Facturé & Marge SaaS</span>
          </div>
          <div className="metric-value">${Number(totals.total_cost || 0).toFixed(3)}</div>
          <div className="metric-foot">
            <span>Achat opérateur : ${Number(totals.total_buy_cost || 0).toFixed(3)}</span>
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>
              Marge : +${netMarginUsd.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Consommation par entreprise cliente</h3>
            <p>Aperçu rapide des quotas utilisés par chaque client créé dans le C-Panel.</p>
          </div>
          <button className="sm" onClick={() => onNavigate('cpanel-clients')}>
            Ouvrir la gestion des clients
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Forfait</th>
                <th>Sender ID</th>
                <th>Contacts</th>
                <th>Transactions</th>
                <th>Budget consommé</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {clientsData.clients.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="cell-main">{c.name}</div>
                    <div className="cell-sub mono">{c.email}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{c.plan}</td>
                  <td className="mono">{c.sender_id}</td>
                  <td className="mono">
                    {c.used_contacts} / {c.limits?.maxContacts || 500}
                  </td>
                  <td className="mono">{c.total_tx}</td>
                  <td className="mono">
                    ${Number(c.used_spend || 0).toFixed(2)} / ${c.limits?.maxSpendUsd || 25}
                  </td>
                  <td>
                    <span className={`status-pill ${c.status === 'suspended' ? 'suspended' : 'active'}`}>
                      <span className="status-dot" />
                      {c.status === 'suspended' ? 'Suspendu' : 'Actif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Trafic, DLR et Marges par opérateur télécom (Routes partagées)</h3>
            <p>Répartition des envois, accusés de livraison (DLR), coûts d'achat opérateurs et marges nettes SaaS.</p>
          </div>
          <button className="sm" onClick={() => onNavigate('cpanel-routes')}>
            Configurer les passerelles
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Opérateur / Route</th>
                <th>Canal</th>
                <th>Sortants</th>
                <th>Livrés (DLR)</th>
                <th>Entrants (MO)</th>
                <th>Latence</th>
                <th>Coût Achat (USD)</th>
                <th>Facturé Client (USD)</th>
                <th>Marge Nette SaaS</th>
              </tr>
            </thead>
            <tbody>
              {(s.byOperator || []).map((row, idx) => {
                const margin = Number(row.cost || 0) - Number(row.buy_cost || 0);
                return (
                  <tr key={idx}>
                    <td className="cell-main">{row.operator}</td>
                    <td>
                      <ChannelBadge c={row.channel} />
                    </td>
                    <td className="mono">{row.sent}</td>
                    <td className="mono">{row.delivered || 0}</td>
                    <td className="mono">{row.received}</td>
                    <td className="mono mute">{row.avg_latency_ms || 38} ms</td>
                    <td className="mono mute">${Number(row.buy_cost || 0).toFixed(4)}</td>
                    <td className="mono">${Number(row.cost || 0).toFixed(4)}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                      +${margin.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AdminClientsPanel({ onOpenClientWorkspace }) {
  const [data, setData] = useState({ clients: [], presets: {} });
  const [showCreate, setShowCreate] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    company: '',
    email: '',
    password: '',
    senderId: '',
    plan: 'starter',
    maxContacts: 500,
    maxSms: 1000,
    maxWhatsapp: 1000,
    maxRcs: 500,
    maxEmails: 5000,
    maxSpendUsd: 25,
    allowedChannels: ['sms', 'whatsapp', 'email']
  });

  const load = useCallback(() => {
    api('/admin/clients').then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = planKey => {
    const p = data.presets?.[planKey] || {
      maxContacts: 500,
      maxSms: 1000,
      maxWhatsapp: 1000,
      maxRcs: 500,
      maxEmails: 5000,
      maxSpendUsd: 25,
      allowedChannels: ['sms', 'whatsapp', 'email']
    };
    setForm(prev => ({
      ...prev,
      plan: planKey,
      maxContacts: p.maxContacts,
      maxSms: p.maxSms,
      maxWhatsapp: p.maxWhatsapp,
      maxRcs: p.maxRcs,
      maxEmails: p.maxEmails,
      maxSpendUsd: p.maxSpendUsd,
      allowedChannels: p.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email']
    }));
  };

  const toggleAllowedChannel = ch => {
    const cur = form.allowedChannels || [];
    setForm({
      ...form,
      allowedChannels: cur.includes(ch) ? cur.filter(x => x !== ch) : [...cur, ch]
    });
  };

  const handleCreate = async e => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await api('/admin/clients', {
        method: 'POST',
        body: {
          company: form.company,
          email: form.email,
          password: form.password,
          senderId: form.senderId,
          plan: form.plan,
          limits: {
            maxContacts: +form.maxContacts,
            maxSms: +form.maxSms,
            maxWhatsapp: +form.maxWhatsapp,
            maxRcs: +form.maxRcs,
            maxEmails: +form.maxEmails,
            maxSpendUsd: +form.maxSpendUsd,
            allowedChannels: form.allowedChannels
          }
        }
      });
      setMsg(`Compte client "${form.company}" (${form.email}) créé avec succès.`);
      setShowCreate(false);
      setForm({
        company: '',
        email: '',
        password: '',
        senderId: '',
        plan: 'starter',
        maxContacts: 500,
        maxSms: 1000,
        maxWhatsapp: 1000,
        maxRcs: 500,
        maxEmails: 5000,
        maxSpendUsd: 25,
        allowedChannels: ['sms', 'whatsapp', 'email']
      });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const openEditModal = c => {
    setEditClient({
      id: c.id,
      name: c.name,
      email: c.email,
      plan: c.plan || 'starter',
      status: c.status || 'active',
      senderId: c.sender_id || 'RAYONS',
      newPassword: '',
      maxContacts: c.limits?.maxContacts ?? 500,
      maxSms: c.limits?.maxSms ?? 1000,
      maxWhatsapp: c.limits?.maxWhatsapp ?? 1000,
      maxRcs: c.limits?.maxRcs ?? 500,
      maxEmails: c.limits?.maxEmails ?? 5000,
      maxSpendUsd: c.limits?.maxSpendUsd ?? 25,
      allowedChannels: c.limits?.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email']
    });
  };

  const handleSaveEdit = async e => {
    e.preventDefault();
    if (!editClient) return;
    setErr('');
    setMsg('');
    try {
      await api(`/admin/clients/${editClient.id}`, {
        method: 'PUT',
        body: {
          name: editClient.name,
          email: editClient.email,
          plan: editClient.plan,
          status: editClient.status,
          senderId: editClient.senderId,
          newPassword: editClient.newPassword || undefined,
          limits: {
            maxContacts: +editClient.maxContacts,
            maxSms: +editClient.maxSms,
            maxWhatsapp: +editClient.maxWhatsapp,
            maxRcs: +editClient.maxRcs,
            maxEmails: +editClient.maxEmails,
            maxSpendUsd: +editClient.maxSpendUsd,
            allowedChannels: editClient.allowedChannels
          }
        }
      });
      setMsg(`Limites du client "${editClient.name}" mises à jour.`);
      setEditClient(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleStatus = async c => {
    const next = c.status === 'suspended' ? 'active' : 'suspended';
    await api(`/admin/clients/${c.id}`, {
      method: 'PUT',
      body: { status: next }
    });
    load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Comptes Clients et Limites d'utilisation</h2>
          <p>
            Créez des comptes clients, définissez leurs plafonds mensuels et accédez en un clic à leur Espace Client.
          </p>
        </div>
        <div className="row">
          <button onClick={load}>Actualiser</button>
          <button className="primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Fermer le formulaire' : 'Nouveau compte client'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          {msg}
        </div>
      )}
      {err && (
        <div className="notice err" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {showCreate && (
        <form className="card" onSubmit={handleCreate}>
          <div className="card-header">
            <div>
              <h3>Créer un compte client SaaS</h3>
              <p>
                Le client disposera de son propre Espace Client isolé et utilisera vos routes télécoms partagées.
              </p>
            </div>
            <div className="row">
              {['starter', 'business', 'enterprise'].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`sm ${form.plan === p ? 'primary' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  Forfait {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-auto" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Entreprise cliente</label>
              <input
                placeholder="Ex. Kivu Market SARL"
                value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Email du client (Identifiant et expéditeur)</label>
              <input
                type="email"
                placeholder="contact@client.cd"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Mot de passe initial</label>
              <input
                type="text"
                placeholder="8 caractères minimum"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Sender ID Télécom (11 caract. max)</label>
              <input
                placeholder="Ex. KIVUMARKET"
                value={form.senderId}
                onChange={e => setForm({ ...form, senderId: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Contacts maximum</label>
              <input
                type="number"
                value={form.maxContacts}
                onChange={e => setForm({ ...form, maxContacts: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Quota SMS Télécom / mois</label>
              <input
                type="number"
                value={form.maxSms}
                onChange={e => setForm({ ...form, maxSms: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Quota WhatsApp / mois</label>
              <input
                type="number"
                value={form.maxWhatsapp}
                onChange={e => setForm({ ...form, maxWhatsapp: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Quota RCS Opérateur / mois</label>
              <input
                type="number"
                value={form.maxRcs}
                onChange={e => setForm({ ...form, maxRcs: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Quota Emails directs / mois</label>
              <input
                type="number"
                value={form.maxEmails}
                onChange={e => setForm({ ...form, maxEmails: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Plafond Budget Télécom (USD)</label>
              <input
                type="number"
                step="0.5"
                value={form.maxSpendUsd}
                onChange={e => setForm({ ...form, maxSpendUsd: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>Canaux activés pour ce client</label>
            <div className="row" style={{ gap: 16, marginTop: 4 }}>
              {Object.entries(CH).map(([k, label]) => (
                <label
                  key={k}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={form.allowedChannels.includes(k)}
                    onChange={() => toggleAllowedChannel(k)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button type="submit" className="primary">
              Créer le compte client
            </button>
            <button type="button" onClick={() => setShowCreate(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Entreprises clientes ({data.clients.length})</h3>
            <p>Cliquez sur « Ouvrir Espace Client » pour accéder directement au portail CRM d'un client.</p>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Entreprise et compte</th>
                <th>Forfait</th>
                <th>Sender ID</th>
                <th>Contacts</th>
                <th>Quotas mensuels (Utilisés / Max)</th>
                <th>Budget USD</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions C-Panel</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map(c => {
                const lim = c.limits || {};
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-main">
                        {c.name}{' '}
                        {c.role === 'superadmin' && (
                          <span className="badge neutral">Master</span>
                        )}
                      </div>
                      <div className="cell-sub mono">{c.email}</div>
                    </td>
                    <td>
                      <span className="badge neutral" style={{ textTransform: 'capitalize' }}>
                        {c.plan}
                      </span>
                    </td>
                    <td className="mono">{c.sender_id}</td>
                    <td className="mono">
                      {c.used_contacts} / {lim.maxContacts || 500}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>
                        SMS : <span className="mono">{c.used_sms}/{lim.maxSms}</span> • WhatsApp :{' '}
                        <span className="mono">{c.used_whatsapp}/{lim.maxWhatsapp}</span>
                      </div>
                      <div className="mute">
                        RCS : <span className="mono">{c.used_rcs}/{lim.maxRcs}</span> • Email :{' '}
                        <span className="mono">{c.used_email}/{lim.maxEmails}</span>
                      </div>
                    </td>
                    <td className="mono">
                      ${Number(c.used_spend || 0).toFixed(2)} / ${lim.maxSpendUsd || 25}
                    </td>
                    <td>
                      <span className={`status-pill ${c.status === 'suspended' ? 'suspended' : 'active'}`}>
                        <span className="status-dot" />
                        {c.status === 'suspended' ? 'Suspendu' : 'Actif'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="sm primary"
                        onClick={() => onOpenClientWorkspace(c.id)}
                      >
                        Ouvrir Espace Client
                      </button>{' '}
                      <button className="sm" onClick={() => openEditModal(c)}>
                        Limites
                      </button>{' '}
                      {c.role !== 'superadmin' && (
                        <>
                          <button className="sm" onClick={() => toggleStatus(c)}>
                            {c.status === 'suspended' ? 'Activer' : 'Suspendre'}
                          </button>{' '}
                          <button
                            className="sm danger"
                            onClick={async () => {
                              await api(`/admin/clients/${c.id}`, { method: 'DELETE' });
                              load();
                            }}
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editClient && (
        <div className="modal-overlay" onClick={() => setEditClient(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifier les limites — {editClient.name}</h3>
              <button className="sm ghost" onClick={() => setEditClient(null)}>
                <Icon name="close" />
              </button>
            </div>
            <form className="modal-content" onSubmit={handleSaveEdit}>
              <div className="grid-2">
                <div className="field">
                  <label>Entreprise</label>
                  <input
                    value={editClient.name}
                    onChange={e => setEditClient({ ...editClient, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Sender ID Télécom</label>
                  <input
                    value={editClient.senderId}
                    onChange={e => setEditClient({ ...editClient, senderId: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Forfait</label>
                  <select
                    value={editClient.plan}
                    onChange={e => {
                      const pKey = e.target.value;
                      const p = data.presets?.[pKey] || {};
                      setEditClient({
                        ...editClient,
                        plan: pKey,
                        maxContacts: p.maxContacts ?? editClient.maxContacts,
                        maxSms: p.maxSms ?? editClient.maxSms,
                        maxWhatsapp: p.maxWhatsapp ?? editClient.maxWhatsapp,
                        maxRcs: p.maxRcs ?? editClient.maxRcs,
                        maxEmails: p.maxEmails ?? editClient.maxEmails,
                        maxSpendUsd: p.maxSpendUsd ?? editClient.maxSpendUsd
                      });
                    }}
                  >
                    <option value="starter">Starter</option>
                    <option value="business">Business</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="field">
                  <label>Nouveau mot de passe (optionnel)</label>
                  <input
                    type="password"
                    placeholder="Laisser vide pour conserver"
                    value={editClient.newPassword}
                    onChange={e => setEditClient({ ...editClient, newPassword: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Contacts maximum</label>
                  <input
                    type="number"
                    value={editClient.maxContacts}
                    onChange={e => setEditClient({ ...editClient, maxContacts: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quota SMS / mois</label>
                  <input
                    type="number"
                    value={editClient.maxSms}
                    onChange={e => setEditClient({ ...editClient, maxSms: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quota WhatsApp / mois</label>
                  <input
                    type="number"
                    value={editClient.maxWhatsapp}
                    onChange={e => setEditClient({ ...editClient, maxWhatsapp: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quota RCS / mois</label>
                  <input
                    type="number"
                    value={editClient.maxRcs}
                    onChange={e => setEditClient({ ...editClient, maxRcs: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quota Emails / mois</label>
                  <input
                    type="number"
                    value={editClient.maxEmails}
                    onChange={e => setEditClient({ ...editClient, maxEmails: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Plafond Budget (USD)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editClient.maxSpendUsd}
                    onChange={e => setEditClient({ ...editClient, maxSpendUsd: e.target.value })}
                  />
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" onClick={() => setEditClient(null)}>
                  Annuler
                </button>
                <button type="submit" className="primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function CPanelBilling() {
  const [data, setData] = useState({ clients: [], creditLogs: [], rechargeRequests: [] });
  const [f, setF] = useState({
    tenantId: '',
    amountUsd: '25',
    paymentMethod: 'M-Pesa Vodacom',
    reference: '',
    note: ''
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api('/admin/clients')
      .then(res => {
        setData(res);
        if (!f.tenantId && res.clients?.length > 0) {
          const firstClient = res.clients.find(c => c.role !== 'superadmin') || res.clients[0];
          setF(prev => ({ ...prev, tenantId: String(firstClient.id) }));
        }
      })
      .catch(console.error);
  }, [f.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecharge = async e => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const out = await api(`/admin/clients/${f.tenantId}/recharge`, {
        method: 'POST',
        body: {
          amountUsd: +f.amountUsd,
          paymentMethod: f.paymentMethod,
          reference: f.reference,
          note: f.note
        }
      });
      setMsg(`Crédit rechargé (+${f.amountUsd} USD). Nouveau plafond : $${out.newMaxSpendUsd} USD.`);
      setF(prev => ({ ...prev, reference: '', note: '' }));
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const reviewRequest = async (id, decision) => {
    setMsg('');
    setErr('');
    try {
      const out = await api(`/admin/recharge-requests/${id}/review`, {
        method: 'POST',
        body: { decision }
      });
      setMsg(
        decision === 'approved'
          ? `Demande approuvée : compte client crédité (nouveau plafond : $${out.newMaxSpendUsd} USD).`
          : 'Demande de rechargement rejetée.'
      );
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const pendingReqs = (data.rechargeRequests || []).filter(r => r.status === 'pending');

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Facturation, Validation Mobile Money et Crédits Clients</h2>
          <p>
            Validez en un clic les demandes de rechargement soumises par vos clients depuis leur Espace Client ou créditez-les manuellement.
          </p>
        </div>
        <button onClick={load}>Actualiser</button>
      </div>

      {msg && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          {msg}
        </div>
      )}
      {err && (
        <div className="notice err" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {/* DEMANDES DE RECHARGEMENT SOUMISES PAR LES CLIENTS */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>
              Demandes de rechargement Mobile Money / Banque des clients ({pendingReqs.length} en attente)
            </h3>
            <p>
              Lorsqu'un client soumet une preuve de paiement M-Pesa, Airtel Money, Orange Money ou virement dans son Espace Client, validez-la ici.
            </p>
          </div>
        </div>

        {(data.rechargeRequests || []).length === 0 ? (
          <p className="mute">Aucune demande de rechargement soumise pour le moment.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client SaaS</th>
                  <th>Montant demandé</th>
                  <th>Moyen & Numéro payeur</th>
                  <th>Référence paiement</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right' }}>Validation C-Panel</th>
                </tr>
              </thead>
              <tbody>
                {(data.rechargeRequests || []).map(r => (
                  <tr key={r.id}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td>
                      <div className="cell-main">{r.tenant_name || `Client #${r.tenant_id}`}</div>
                      <div className="cell-sub">{r.note || ''}</div>
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      +${Number(r.amount_usd).toFixed(2)} USD
                    </td>
                    <td>
                      <span className="badge neutral">{r.payment_method}</span>
                      {r.payer_phone && <div className="cell-sub mono">{r.payer_phone}</div>}
                    </td>
                    <td className="mono">{r.reference}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          r.status === 'approved'
                            ? 'delivered'
                            : r.status === 'rejected'
                            ? 'failed'
                            : 'queued'
                        }`}
                      >
                        <span className="status-dot" />
                        {r.status === 'approved'
                          ? 'Approuvée'
                          : r.status === 'rejected'
                          ? 'Rejetée'
                          : 'En attente'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.status === 'pending' ? (
                        <>
                          <button
                            className="sm primary"
                            onClick={() => reviewRequest(r.id, 'approved')}
                          >
                            Approuver & Créditer
                          </button>{' '}
                          <button
                            className="sm danger"
                            onClick={() => reviewRequest(r.id, 'rejected')}
                          >
                            Rejeter
                          </button>
                        </>
                      ) : (
                        <span className="mute" style={{ fontSize: 12 }}>
                          Traitée
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="split-view">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>Historique des paiements et rechargements validés</h3>
              <p>Opérations de crédit enregistrées dans le C-Panel.</p>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Montant</th>
                  <th>Mode de paiement</th>
                  <th>Référence</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(data.creditLogs || []).map(log => (
                  <tr key={log.id}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="cell-main">{log.tenant_name || `Tenant #${log.tenant_id}`}</td>
                    <td className="mono">+${Number(log.amount_usd).toFixed(2)}</td>
                    <td>
                      <span className="badge neutral">{log.payment_method}</span>
                    </td>
                    <td className="mono">{log.reference || '—'}</td>
                    <td className="mute">{log.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form className="card sticky-panel" style={{ marginBottom: 0 }} onSubmit={handleRecharge}>
          <div className="card-header">
            <div>
              <h3>Créditer directement un client</h3>
              <p>Augmente immédiatement le plafond de budget télécom du client.</p>
            </div>
          </div>

          <div className="field">
            <label>Entreprise cliente</label>
            <select
              value={f.tenantId}
              onChange={e => setF({ ...f, tenantId: e.target.value })}
              required
            >
              {data.clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) — Plafond actuel : ${c.limits?.maxSpendUsd || 25}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Montant à créditer (USD)</label>
            <input
              type="number"
              step="1"
              min="1"
              value={f.amountUsd}
              onChange={e => setF({ ...f, amountUsd: e.target.value })}
              required
            />
          </div>

          <div className="field">
            <label>Canal de paiement reçu</label>
            <select
              value={f.paymentMethod}
              onChange={e => setF({ ...f, paymentMethod: e.target.value })}
            >
              <option value="M-Pesa Vodacom">M-Pesa Vodacom</option>
              <option value="Airtel Money">Airtel Money</option>
              <option value="Orange Money">Orange Money</option>
              <option value="Afrimoney">Afrimoney</option>
              <option value="Virement Bancaire">Virement Bancaire</option>
              <option value="Espèces">Espèces</option>
            </select>
          </div>

          <div className="field">
            <label>Référence de transaction (Mobile Money / Banque)</label>
            <input
              placeholder="Ex. MPESA-948271"
              value={f.reference}
              onChange={e => setF({ ...f, reference: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Note interne</label>
            <input
              placeholder="Ex. Rechargement mensuel"
              value={f.note}
              onChange={e => setF({ ...f, note: e.target.value })}
            />
          </div>

          <button type="submit" className="primary" style={{ width: '100%' }}>
            Valider le rechargement (+${f.amountUsd} USD)
          </button>
        </form>
      </div>
    </>
  );
}

function CPanelRoutes() {
  const [d, setD] = useState(null);
  const [ok, setOk] = useState(false);
  const [whLogs, setWhLogs] = useState([]);
  const [testResults, setTestResults] = useState({});
  const [testingOp, setTestingOp] = useState(null);

  const [dlrSim, setDlrSim] = useState({ txRef: '', status: 'DELIVRD', errCode: '000' });
  const [moSim, setMoSim] = useState({
    from: '+243 81 450 0111',
    toSenderId: 'KIVUTECH',
    text: 'Bonjour, je confirme la réception de votre offre. Merci !',
    channel: 'sms'
  });
  const [simNotice, setSimNotice] = useState('');

  const loadWebhooks = useCallback(() => {
    api('/admin/webhooks').then(setWhLogs).catch(() => {});
  }, []);

  useEffect(() => {
    api('/settings').then(x => setD({ ...x, settings: x.settings || {} }));
    loadWebhooks();
  }, [loadWebhooks]);

  if (!d) return <div className="card mute">Chargement des routes télécoms maîtresses…</div>;

  const setTelecom = (op, k) => e => {
    const telecom = d.settings.telecom || {};
    setD({
      ...d,
      settings: {
        ...d.settings,
        telecom: {
          ...telecom,
          [op]: { ...(telecom[op] || {}), [k]: e.target.value }
        }
      }
    });
  };
  const vTelecom = (op, k, fallback = '') => d.settings.telecom?.[op]?.[k] ?? fallback;

  const setGroup = (g, k) => e =>
    setD({
      ...d,
      settings: { ...d.settings, [g]: { ...(d.settings[g] || {}), [k]: e.target.value } }
    });
  const vGroup = (g, k, fallback = '') => d.settings[g]?.[k] ?? fallback;

  const save = async () => {
    await api('/settings', { method: 'PUT', body: { settings: d.settings } });
    const refreshed = await api('/settings');
    setD({ ...refreshed, settings: refreshed.settings || {} });
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  const runRouteTest = async opKey => {
    setTestingOp(opKey);
    try {
      const out = await api('/admin/routes/test', {
        method: 'POST',
        body: { operator: opKey, settingsOverride: d.settings }
      });
      setTestResults(prev => ({ ...prev, [opKey]: { ok: true, ...out } }));
      loadWebhooks();
    } catch (e) {
      setTestResults(prev => ({ ...prev, [opKey]: { ok: false, error: e.message } }));
      loadWebhooks();
    } finally {
      setTestingOp(null);
    }
  };

  const triggerSimulateDlr = async e => {
    e.preventDefault();
    setSimNotice('');
    try {
      const out = await api('/admin/webhooks/simulate-dlr', {
        method: 'POST',
        body: dlrSim
      });
      setSimNotice(
        `Webhook DLR reçu : Transaction ${out.txRef || 'récente'} mise à jour vers "${out.status}" (Code : ${out.dlrCode}).`
      );
      loadWebhooks();
    } catch (err) {
      setSimNotice(`Erreur DLR : ${err.message}`);
    }
  };

  const triggerSimulateMo = async e => {
    e.preventDefault();
    setSimNotice('');
    try {
      const out = await api('/admin/webhooks/simulate-mo', {
        method: 'POST',
        body: moSim
      });
      setSimNotice(
        `SMS Entrant (MO) routé vers le client "${out.tenant}" (Réf : ${out.message?.tx_ref}).`
      );
      loadWebhooks();
    } catch (err) {
      setSimNotice(`Erreur MO : ${err.message}`);
    }
  };

  const telecomOps = [
    {
      key: 'vodacom',
      name: 'Vodacom RDC (Préfixes 081, 082, 083)',
      defaultUrl: 'https://sdp.vodacom.cd/api/v1/sms/send',
      defaultSmpp: 'smpp.vodacom.cd',
      defaultBuy: '0.009',
      defaultSell: '0.015'
    },
    {
      key: 'airtel',
      name: 'Airtel RDC (Préfixes 097, 098, 099)',
      defaultUrl: 'https://messaging.airtel.cd/api/v1/messages',
      defaultSmpp: 'smpp.airtel.cd',
      defaultBuy: '0.008',
      defaultSell: '0.014'
    },
    {
      key: 'orange',
      name: 'Orange RDC (Préfixes 080, 084, 085, 089)',
      defaultUrl: 'https://api.orange.cd/smsmessaging/v1/outbound',
      defaultSmpp: 'smpp.orange.cd',
      defaultBuy: '0.009',
      defaultSell: '0.015'
    },
    {
      key: 'africell',
      name: 'Africell RDC (Préfixes 090, 091)',
      defaultUrl: 'https://gw.africell.cd/api/sms/send',
      defaultSmpp: 'smpp.africell.cd',
      defaultBuy: '0.007',
      defaultSell: '0.012'
    }
  ];

  const webhookBase = d.webhookBase || `${API}/webhooks`;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Passerelles Télécoms RDC (SMPP v3.4 / HTTP) et Webhooks DLR</h2>
          <p>
            Configurez vos interconnexions directes avec Vodacom, Airtel, Orange et Africell RDC, vos coûts d'achat/revente et vos Webhooks d'accusés de livraison (DLR).
          </p>
        </div>
        <div className="row">
          {ok && <span className="notice ok" style={{ padding: '6px 10px' }}>Configuration enregistrée</span>}
          <button onClick={loadWebhooks}>Actualiser Webhooks</button>
          <button className="primary" onClick={save}>
            Enregistrer les routes maîtresses
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Connecteurs Opérateurs Télécoms RDC (SMPP v3.4 Direct & REST SDP)</h3>
            <p>
              Sélectionnez le protocole de chaque opérateur (SMPP v3.4 TCP, Orange SDP, HTTP REST ou HTTP GET Kannel) et testez la liaison.
            </p>
          </div>
          <ChannelBadge c="sms" />
        </div>

        {telecomOps.map(op => {
          const protocol = vTelecom(op.key, 'protocol', op.key === 'orange' ? 'orange_sdp' : 'http_json');
          const mode = vTelecom(op.key, 'mode', 'sandbox_dlr');
          const buyCost = Number(vTelecom(op.key, 'buyCost', op.defaultBuy) || 0);
          const sellCost = Number(vTelecom(op.key, 'smsCost', op.defaultSell) || 0);
          const unitMargin = sellCost - buyCost;
          const diag = testResults[op.key];

          return (
            <div key={op.key} className="route-block">
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <h4 style={{ marginBottom: 2 }}>{op.name}</h4>
                  <div className="mute" style={{ fontSize: 12 }}>
                    Marge unitaire :{' '}
                    <strong className="mono" style={{ color: 'var(--green)' }}>
                      +${unitMargin.toFixed(4)} / SMS
                    </strong>{' '}
                    (Achat : ${buyCost.toFixed(4)} → Client : ${sellCost.toFixed(4)})
                  </div>
                </div>
                <div className="row">
                  <span className={`status-pill ${mode === 'live' ? 'sent' : 'active'}`}>
                    <span className="status-dot" />
                    {mode === 'live' ? 'Production Live' : 'Bac à sable + DLR Auto'}
                  </span>
                  <button
                    type="button"
                    className="sm"
                    disabled={testingOp === op.key}
                    onClick={() => runRouteTest(op.key)}
                  >
                    {testingOp === op.key ? 'Test en cours…' : 'Tester la passerelle'}
                  </button>
                </div>
              </div>

              {diag && (
                <div
                  className={`notice ${diag.ok ? 'ok' : 'err'}`}
                  style={{ marginBottom: 12 }}
                >
                  {diag.ok ? diag.message : diag.error}
                </div>
              )}

              <div className="grid-4" style={{ marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Protocole Opérateur</label>
                  <select value={protocol} onChange={setTelecom(op.key, 'protocol')}>
                    <option value="http_json">HTTP REST JSON (SDP)</option>
                    <option value="orange_sdp">Orange RDC SDP API</option>
                    <option value="smpp_v34">SMPP v3.4 Direct (TCP)</option>
                    <option value="http_get">HTTP GET (Kannel / Jasmin)</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Mode d'exécution</label>
                  <select value={mode} onChange={setTelecom(op.key, 'mode')}>
                    <option value="sandbox_dlr">Simulation Réseau + DLR Auto (1.2s)</option>
                    <option value="live">Production Live (Connexion Réelle)</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Coût d'achat opérateur (USD)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={vTelecom(op.key, 'buyCost', op.defaultBuy)}
                    onChange={setTelecom(op.key, 'buyCost')}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Tarif facturé au client (USD)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={vTelecom(op.key, 'smsCost', op.defaultSell)}
                    onChange={setTelecom(op.key, 'smsCost')}
                  />
                </div>
              </div>

              {protocol === 'smpp_v34' ? (
                <div className="grid-4" style={{ marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Hôte SMSC (SMPP Host)</label>
                    <input
                      className="mono"
                      value={vTelecom(op.key, 'smppHost', op.defaultSmpp)}
                      onChange={setTelecom(op.key, 'smppHost')}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Port TCP SMPP</label>
                    <input
                      className="mono"
                      value={vTelecom(op.key, 'smppPort', '2775')}
                      onChange={setTelecom(op.key, 'smppPort')}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>System ID (Identifiant SMPP)</label>
                    <input
                      className="mono"
                      value={vTelecom(op.key, 'systemId', `rayons_${op.key}`)}
                      onChange={setTelecom(op.key, 'systemId')}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Mot de passe SMPP</label>
                    <input
                      type="password"
                      placeholder="Mot de passe bind_transceiver"
                      value={vTelecom(op.key, 'smppPassword')}
                      onChange={setTelecom(op.key, 'smppPassword')}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid-4" style={{ marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>URL Gateway HTTP Opérateur</label>
                    <input
                      className="mono"
                      value={vTelecom(op.key, 'gatewayUrl', op.defaultUrl)}
                      onChange={setTelecom(op.key, 'gatewayUrl')}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Authentification HTTP</label>
                    <select
                      value={vTelecom(op.key, 'authType', 'bearer')}
                      onChange={setTelecom(op.key, 'authType')}
                    >
                      <option value="bearer">Bearer Token (OAuth2 / JWT)</option>
                      <option value="apikey_header">En-tête X-API-Key</option>
                      <option value="basic">HTTP Basic (User / Pass)</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Clé API / Token Opérateur</label>
                    <input
                      type="password"
                      placeholder="Token direct opérateur"
                      value={vTelecom(op.key, 'apiKey')}
                      onChange={setTelecom(op.key, 'apiKey')}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Identifiant / Username (si Basic/GET)</label>
                    <input
                      placeholder="Optionnel"
                      value={vTelecom(op.key, 'username')}
                      onChange={setTelecom(op.key, 'username')}
                    />
                  </div>
                </div>
              )}

              <div className="notice mono" style={{ fontSize: 11.5, padding: '8px 12px' }}>
                Webhook DLR (Accusés de livraison) : <strong>POST {webhookBase}/dlr/{op.key}</strong> • Webhook Entrant (MO) :{' '}
                <strong>POST {webhookBase}/inbound/{op.key}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Passerelle WhatsApp Cloud API (Meta)</h3>
            <p>Configuration partagée pour les envois et réceptions WhatsApp Business.</p>
          </div>
          <ChannelBadge c="whatsapp" />
        </div>
        <div className="grid-4">
          <div className="field">
            <label>Phone Number ID</label>
            <input
              placeholder="104928374928374"
              value={vGroup('whatsapp', 'phoneId')}
              onChange={setGroup('whatsapp', 'phoneId')}
            />
          </div>
          <div className="field">
            <label>Access Token Permanent</label>
            <input
              type="password"
              placeholder="EAAGm0PX4ZCpsBA..."
              value={vGroup('whatsapp', 'token')}
              onChange={setGroup('whatsapp', 'token')}
            />
          </div>
          <div className="field">
            <label>Coût d'achat Meta (USD)</label>
            <input
              type="number"
              step="0.001"
              value={vGroup('whatsapp', 'buyCost', '0.005')}
              onChange={setGroup('whatsapp', 'buyCost')}
            />
          </div>
          <div className="field">
            <label>Tarif facturé client (USD)</label>
            <input
              type="number"
              step="0.001"
              value={vGroup('whatsapp', 'cost', '0.008')}
              onChange={setGroup('whatsapp', 'cost')}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Passerelle RCS Business Messaging (Google Jibe / Opérateurs RDC + Repli SMS)</h3>
            <p>
              Configuration de l'Agent RCS Vérifié (Cartes Riches, images, boutons d'action interactifs et bascule SMS automatique).
            </p>
          </div>
          <ChannelBadge c="rcs" />
        </div>
        <div className="grid-4">
          <div className="field">
            <label>ID Agent RCS Vérifié</label>
            <input
              className="mono"
              placeholder="RAYONS_RCS_CD"
              value={vGroup('rcs', 'agentId', 'RAYONS_RCS_CD')}
              onChange={setGroup('rcs', 'agentId')}
            />
          </div>
          <div className="field">
            <label>Endpoint RBM / Jibe Gateway</label>
            <input
              className="mono"
              placeholder="https://rbm.googleapis.com/v1/phones"
              value={vGroup('rcs', 'jibeGatewayUrl', 'https://rbm.googleapis.com/v1/phones')}
              onChange={setGroup('rcs', 'jibeGatewayUrl')}
            />
          </div>
          <div className="field">
            <label>Coût d'achat RCS (USD)</label>
            <input
              type="number"
              step="0.001"
              value={vGroup('rcs', 'buyCost', '0.012')}
              onChange={setGroup('rcs', 'buyCost')}
            />
          </div>
          <div className="field">
            <label>Tarif facturé client RCS (USD)</label>
            <input
              type="number"
              step="0.001"
              value={vGroup('rcs', 'cost', '0.020')}
              onChange={setGroup('rcs', 'cost')}
            />
          </div>
        </div>
      </div>

      {/* SIMULATEUR INTERACTIF DE WEBHOOKS OPÉRATEURS (DLR & ENTRANTS MO) */}
      {simNotice && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          {simNotice}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <form className="card" style={{ marginBottom: 0 }} onSubmit={triggerSimulateDlr}>
          <div className="card-header">
            <div>
              <h3>Simulateur d'Accusé de Réception Opérateur (Webhook DLR)</h3>
              <p>
                Simule le callback envoyé par le SMSC opérateur lorsqu'un SMS/WhatsApp arrive sur le téléphone du destinataire.
              </p>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Référence transaction (vide = dernière envoyée)</label>
              <input
                className="mono"
                placeholder="Ex. RAY-1001"
                value={dlrSim.txRef}
                onChange={e => setDlrSim({ ...dlrSim, txRef: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Statut DLR renvoyé par l'opérateur</label>
              <select
                value={dlrSim.status}
                onChange={e =>
                  setDlrSim({
                    ...dlrSim,
                    status: e.target.value,
                    errCode: e.target.value === 'DELIVRD' ? '000' : '027'
                  })
                }
              >
                <option value="DELIVRD">DELIVRD 000 (Livré sur mobile)</option>
                <option value="UNDELIV">UNDELIV 027 (Abonné hors réseau / Échec)</option>
                <option value="REJECTD">REJECTD 088 (Rejeté par l'opérateur)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="primary" style={{ width: '100%' }}>
            Déclencher le Webhook DLR Opérateur
          </button>
        </form>

        <form className="card" style={{ marginBottom: 0 }} onSubmit={triggerSimulateMo}>
          <div className="card-header">
            <div>
              <h3>Simulateur de Réponse Abonné (Webhook SMS Entrant MO)</h3>
              <p>
                Simule un SMS entrant envoyé par un numéro RDC (+243) vers le Sender ID d'un de vos clients SaaS.
              </p>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Numéro de l'abonné RDC (+243)</label>
              <input
                className="mono"
                value={moSim.from}
                onChange={e => setMoSim({ ...moSim, from: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Sender ID du client SaaS destinataire</label>
              <input
                className="mono"
                placeholder="KIVUTECH ou HORIZON"
                value={moSim.toSenderId}
                onChange={e => setMoSim({ ...moSim, toSenderId: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Message envoyé par l'abonné</label>
            <input
              value={moSim.text}
              onChange={e => setMoSim({ ...moSim, text: e.target.value })}
              required
            />
          </div>
          <button type="submit" className="primary" style={{ width: '100%' }}>
            Simuler la réception du SMS entrant (MO)
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Journal en temps réel des Webhooks Opérateurs (DLR, MO & Tests de routes)</h3>
            <p>Historique des callbacks reçus sur vos endpoints /webhooks/dlr/* et /webhooks/inbound/*.</p>
          </div>
          <button className="sm" onClick={loadWebhooks}>
            Actualiser ({whLogs.length})
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Événement</th>
                <th>Opérateur</th>
                <th>Client SaaS</th>
                <th>Réf / MSISDN</th>
                <th>Code DLR / Protocole</th>
                <th>Latence</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {whLogs.map(w => (
                <tr key={w.id}>
                  <td className="mute" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(w.created_at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'medium'
                    })}
                  </td>
                  <td>
                    <span className="badge neutral" style={{ textTransform: 'uppercase' }}>
                      {w.event_type}
                    </span>
                  </td>
                  <td className="cell-main">{w.operator}</td>
                  <td>{w.tenant_name || 'Global'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    <div>{w.tx_ref || '—'}</div>
                    <div className="mute">{w.msisdn || ''}</div>
                  </td>
                  <td className="mono">{w.dlr_code || '—'}</td>
                  <td className="mono mute">{w.latency_ms ? `${w.latency_ms} ms` : '—'}</td>
                  <td>
                    <StatusIndicator status={w.status === 'ok' ? 'delivered' : w.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
 * PARTIE 2 : COMPOSANTS DE L'ESPACE CLIENT (APPLICATION CRM CLIENT)
 * ========================================================================== */

function ClientDashboard({ onNavigate, meUsage }) {
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api('/stats').then(setS).catch(console.error);
    api('/messages').then(m => setRecent(m.slice(0, 6))).catch(console.error);
  }, []);

  if (!s) return <div className="card mute">Chargement de votre espace client…</div>;

  const totals = s.totals || { total_tx: 0, success_tx: 0, failed_tx: 0, out_tx: 0, in_tx: 0, total_cost: 0 };
  const successRate =
    totals.total_tx > 0 ? Math.round((totals.success_tx / totals.total_tx) * 100) : 100;
  const lim = meUsage?.limits || {};
  const u = meUsage?.usage || {};

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Espace Client — {meUsage?.company || 'Mon Entreprise'}</h2>
          <p>
            Forfait {meUsage?.plan || 'Standard'} • Sender ID Télécom : {meUsage?.senderId || 'RAYONS'} • Email direct : {meUsage?.user?.email || ''}
          </p>
        </div>
        <div className="row">
          <button onClick={() => onNavigate('client-templates')}>Modèles de messages</button>
          <button className="primary" onClick={() => onNavigate('client-contacts')}>
            Nouvelle campagne
          </button>
        </div>
      </div>

      {/* Jauges des limites du forfait client */}
      {meUsage && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Mon forfait et mes limites d'utilisation</h3>
              <p>
                Consommation en temps réel par rapport aux plafonds définis pour votre compte client.
              </p>
            </div>
            <span className="badge neutral" style={{ textTransform: 'capitalize' }}>
              Forfait {meUsage.plan}
            </span>
          </div>
          <div className="grid-3">
            <QuotaItem label="Contacts enregistrés" used={u.contacts} max={lim.maxContacts} />
            <QuotaItem label="SMS Télécom (mois)" used={u.sms} max={lim.maxSms} color="var(--blue)" />
            <QuotaItem label="WhatsApp (mois)" used={u.whatsapp} max={lim.maxWhatsapp} color="var(--green)" />
            <QuotaItem label="RCS Opérateur (mois)" used={u.rcs} max={lim.maxRcs} color="var(--amber)" />
            <QuotaItem label="Emails directs (mois)" used={u.email} max={lim.maxEmails} color="var(--purple)" />
            <QuotaItem label="Budget Télécom USD" used={u.spendUsd} max={lim.maxSpendUsd} unit="$" color="var(--amber)" />
          </div>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">
            <span>Mes transactions</span>
          </div>
          <div className="metric-value">{totals.total_tx}</div>
          <div className="metric-foot">
            <span>Envoyés : {totals.out_tx}</span>
            <span>Reçus : {totals.in_tx}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Taux de réussite</span>
          </div>
          <div className="metric-value">{successRate}%</div>
          <div className="metric-foot">
            <span>Validés : {totals.success_tx}</span>
            <span>Échecs : {totals.failed_tx}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Budget consommé</span>
          </div>
          <div className="metric-value">${Number(totals.total_cost || 0).toFixed(3)}</div>
          <div className="metric-foot">
            <span>Plafond : ${lim.maxSpendUsd || 25}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Mes contacts</span>
          </div>
          <div className="metric-value">{s.contacts}</div>
          <div className="metric-foot">
            <span>Max : {lim.maxContacts || 500}</span>
            <button className="sm ghost" onClick={() => onNavigate('client-contacts')}>
              Gérer
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Derniers messages envoyés et reçus</h3>
          </div>
          <button className="sm" onClick={() => onNavigate('client-tx')}>
            Voir tout mon historique
          </button>
        </div>

        {recent.length === 0 ? (
          <p className="mute">Aucun message envoyé pour le moment.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Contact</th>
                  <th>Canal</th>
                  <th>Opérateur</th>
                  <th>Message</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(x => (
                  <tr key={x.id}>
                    <td className="mono">{x.tx_ref || `RAY-${1000 + x.id}`}</td>
                    <td className="cell-main">{x.contact_name || x.addr}</td>
                    <td>
                      <ChannelBadge c={x.channel} />
                    </td>
                    <td className="mute">{x.operator}</td>
                    <td>{x.body}</td>
                    <td>
                      <StatusIndicator status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const ANIMATED_MEDIA_GALLERY = [
  {
    key: 'pulse-promo',
    label: 'Offre Flash Animée',
    badge: 'OFFRE FLASH ENTREPRISE',
    title: 'Activez votre avantage entreprise dès maintenant',
    accent: '#1d4ed8',
    url: `${API}/api/media/animated/pulse-promo.svg`
  },
  {
    key: 'live-payment',
    label: 'Validation Mobile Money',
    badge: 'PAIEMENT VALIDÉ',
    title: 'Votre transaction a été créditée avec succès',
    accent: '#059669',
    url: `${API}/api/media/animated/live-payment.svg`
  },
  {
    key: 'delivery-radar',
    label: 'Radar Suivi Livraison',
    badge: 'EN COURS DE LIVRAISON',
    title: 'Suivi en temps réel de votre expédition',
    accent: '#4338ca',
    url: `${API}/api/media/animated/delivery-radar.svg`
  },
  {
    key: 'vip-event',
    label: 'Invitation VIP Animée',
    badge: 'INVITATION VIP',
    title: 'Rencontre Partenaires & Démonstration Live',
    accent: '#7e22ce',
    url: `${API}/api/media/animated/vip-event.svg`
  },
  {
    key: 'newsletter-wave',
    label: 'Bulletin & Ondes Live',
    badge: 'BULLETIN MENSUEL',
    title: 'Vos Nouveautés & Indicateurs du Mois',
    accent: '#0369a1',
    url: `${API}/api/media/animated/newsletter-wave.svg`
  }
];

function ClientTemplates({ onUseTemplate, onUseTemplateInMass }) {
  const [list, setList] = useState([]);
  const [channelFilter, setChannelFilter] = useState('all');
  const [editId, setEditId] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const emptyForm = {
    name: '',
    channel: 'email',
    subject: '',
    body: '',
    metadata: {
      badgeText: 'OFFRE FLASH ENTREPRISE',
      cardTitle: '',
      mediaUrl: `${API}/api/media/animated/pulse-promo.svg`,
      ctaLabel: 'Découvrir maintenant',
      ctaUrl: 'https://rayons.cd',
      ctaPhone: '+243810000000',
      quickReplies: 'Confirmer,Être rappelé,Tarifs',
      accentColor: '#1d4ed8',
      smsFallback: true,
      isAnimated: true
    }
  };
  const [f, setF] = useState(emptyForm);

  const load = useCallback(() => {
    api('/templates').then(setList).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setMeta = (k, v) =>
    setF(prev => ({
      ...prev,
      metadata: { ...(prev.metadata || {}), [k]: v }
    }));

  const handleAnimatedUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = String(ev.target?.result || '');
      if (dataUrl) {
        setMeta('mediaUrl', dataUrl);
        setMeta('isAnimated', true);
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async e => {
    e.preventDefault();
    if (!f.name || !f.body) return;
    if (editId) {
      await api('/templates/' + editId, { method: 'PUT', body: f });
    } else {
      await api('/templates', { method: 'POST', body: f });
    }
    setEditId(null);
    setF(emptyForm);
    load();
  };

  const startEdit = t => {
    setEditId(t.id);
    setF({
      name: t.name || '',
      channel: t.channel || 'email',
      subject: t.subject || '',
      body: t.body || '',
      metadata: {
        ...emptyForm.metadata,
        ...(t.metadata || {})
      }
    });
  };

  const restoreGallery = async () => {
    setSeeding(true);
    try {
      await api('/templates/seed-gallery', { method: 'POST' });
      load();
    } finally {
      setSeeding(false);
    }
  };

  const filteredList = list.filter(t => channelFilter === 'all' || t.channel === channelFilter);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Bibliothèque de Templates & Emailing avec Images Animées</h2>
          <p>
            Créez et gérez vos modèles réutilisables avec bannières animées (GIF / SVG en mouvement), boutons d'action CTA et variables {'{{name}}'} / {'{{company}}'}.
          </p>
        </div>
        <div className="row">
          <button onClick={restoreGallery} disabled={seeding}>
            {seeding ? 'Chargement…' : 'Charger la galerie de modèles animés'}
          </button>
          <button
            className="primary"
            onClick={() => {
              setEditId(null);
              setF(emptyForm);
            }}
          >
            Nouveau template animé
          </button>
        </div>
      </div>

      <div className="split-view">
        {/* COLONNE GAUCHE : GALERIE VISUELLE DES TEMPLATES ENREGISTRÉS */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>Mes templates disponibles ({filteredList.length})</h3>
              <p>Cliquez sur « Envoi ciblé » ou « Envoi en masse » pour expédier immédiatement un modèle.</p>
            </div>
          </div>

          <div className="filter-bar">
            <div className="filter-chips">
              <button
                type="button"
                className={`chip ${channelFilter === 'all' ? 'active' : ''}`}
                onClick={() => setChannelFilter('all')}
              >
                Tous ({list.length})
              </button>
              {Object.entries(CH).map(([k, label]) => {
                const count = list.filter(x => x.channel === k).length;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`chip ${channelFilter === k ? 'active' : ''}`}
                    onClick={() => setChannelFilter(k)}
                  >
                    {label} <span className="chip-count">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredList.length === 0 ? (
            <p className="mute">Aucun modèle dans cette catégorie.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredList.map(t => {
                const meta = t.metadata || {};
                const hasMedia = Boolean(meta.mediaUrl);
                return (
                  <div key={t.id} className="route-block" style={{ marginBottom: 0 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <ChannelBadge c={t.channel} />
                        <strong style={{ fontSize: 14 }}>{t.name}</strong>
                        {hasMedia && (
                          <span className="badge neutral">Visuel Animé</span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="sm primary"
                          onClick={() => onUseTemplate && onUseTemplate(t)}
                        >
                          Envoi ciblé
                        </button>
                        {onUseTemplateInMass && (
                          <button
                            type="button"
                            className="sm"
                            onClick={() => onUseTemplateInMass(t)}
                          >
                            Envoi en masse
                          </button>
                        )}
                        <button
                          type="button"
                          className="sm"
                          onClick={() => startEdit(t)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="sm danger"
                          onClick={async () => {
                            await api('/templates/' + t.id, { method: 'DELETE' });
                            load();
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>

                    {hasMedia && (
                      <div
                        style={{
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          marginBottom: 10,
                          maxHeight: 155,
                          background: '#09090b'
                        }}
                      >
                        <img
                          src={meta.mediaUrl}
                          alt={t.name}
                          style={{ width: '100%', maxHeight: 155, objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    )}

                    {t.subject && (
                      <div className="cell-main" style={{ marginBottom: 4 }}>
                        Objet : {t.subject}
                      </div>
                    )}
                    {meta.cardTitle && (
                      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>
                        {meta.cardTitle}
                      </div>
                    )}
                    <div className="cell-sub" style={{ whiteSpace: 'pre-line' }}>
                      {t.body}
                    </div>
                    {meta.ctaLabel && (
                      <div style={{ marginTop: 8 }}>
                        <span
                          className="badge neutral"
                          style={{
                            background: meta.accentColor || 'var(--blue)',
                            color: '#fff',
                            border: 'none'
                          }}
                        >
                          Bouton CTA : {meta.ctaLabel} → {meta.ctaUrl || ''}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLONNE DROITE : ÉDITEUR DE TEMPLATE & SÉLECTEUR D'IMAGE ANIMÉE */}
        <form className="card sticky-panel" style={{ marginBottom: 0 }} onSubmit={save}>
          <div className="card-header">
            <div>
              <h3>{editId ? 'Modifier le template' : 'Créer un template (avec image animée)'}</h3>
              <p>Personnalisez le visuel en mouvement, le texte et les boutons d'action.</p>
            </div>
            <ChannelBadge c={f.channel} />
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Nom du template</label>
              <input
                placeholder="Ex. Email Animé — Offre Spéciale"
                value={f.name}
                onChange={e => setF({ ...f, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Canal</label>
              <select
                value={f.channel}
                onChange={e => setF({ ...f, channel: e.target.value })}
              >
                {Object.entries(CH).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(f.channel === 'email' || f.channel === 'rcs') && (
            <div className="target-box" style={{ marginBottom: 12 }}>
              <div className="target-box-title">
                Choisir une image qui bouge (Animation intégrée ou GIF)
              </div>
              <div className="filter-chips">
                {ANIMATED_MEDIA_GALLERY.map(anim => (
                  <button
                    key={anim.key}
                    type="button"
                    className={`chip ${f.metadata?.mediaUrl === anim.url ? 'active' : ''}`}
                    onClick={() => {
                      setF(prev => ({
                        ...prev,
                        metadata: {
                          ...(prev.metadata || {}),
                          mediaUrl: anim.url,
                          badgeText: anim.badge,
                          cardTitle: prev.metadata?.cardTitle || anim.title,
                          accentColor: anim.accent,
                          isAnimated: true
                        }
                      }));
                    }}
                  >
                    {anim.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="chip"
                  onClick={() => setMeta('mediaUrl', '')}
                >
                  Sans image
                </button>
              </div>

              <div className="grid-2" style={{ marginTop: 6 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>URL de l'animation (GIF / SVG / WebP)</label>
                  <input
                    className="mono"
                    placeholder="https://... ou animation intégrée"
                    value={f.metadata?.mediaUrl || ''}
                    onChange={e => setMeta('mediaUrl', e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Ou importer un fichier .GIF depuis l'ordinateur</label>
                  <input
                    type="file"
                    accept="image/gif,image/svg+xml,image/webp,image/*"
                    onChange={handleAnimatedUpload}
                  />
                </div>
              </div>
            </div>
          )}

          {f.channel === 'email' && (
            <>
              <div className="field">
                <label>Objet de l'email (supporte {'{{name}}'} et {'{{company}}'})</label>
                <input
                  placeholder="Ex. Offre Prioritaire — {{company}}"
                  value={f.subject}
                  onChange={e => setF({ ...f, subject: e.target.value })}
                />
              </div>
              <div className="grid-3">
                <div className="field">
                  <label>Badge d'en-tête</label>
                  <input
                    placeholder="OFFRE FLASH"
                    value={f.metadata?.badgeText || ''}
                    onChange={e => setMeta('badgeText', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Titre d'accroche dans l'email</label>
                  <input
                    placeholder="Titre principal"
                    value={f.metadata?.cardTitle || ''}
                    onChange={e => setMeta('cardTitle', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Couleur de marque</label>
                  <input
                    type="color"
                    style={{ height: 36, padding: 2 }}
                    value={f.metadata?.accentColor || '#1d4ed8'}
                    onChange={e => setMeta('accentColor', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Texte du bouton d'action (CTA)</label>
                  <input
                    placeholder="Ex. Activer mon offre"
                    value={f.metadata?.ctaLabel || ''}
                    onChange={e => setMeta('ctaLabel', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Lien URL du bouton CTA</label>
                  <input
                    className="mono"
                    placeholder="https://rayons.cd/offres"
                    value={f.metadata?.ctaUrl || ''}
                    onChange={e => setMeta('ctaUrl', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {f.channel === 'rcs' && (
            <>
              <div className="grid-2">
                <div className="field">
                  <label>Titre de la Carte Riche RCS</label>
                  <input
                    placeholder="Titre RCS"
                    value={f.metadata?.cardTitle || ''}
                    onChange={e => setMeta('cardTitle', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Puces de réponses rapides</label>
                  <input
                    placeholder="Confirmer,Être rappelé,Tarifs"
                    value={f.metadata?.quickReplies || ''}
                    onChange={e => setMeta('quickReplies', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Bouton d'action Web</label>
                  <input
                    placeholder="Découvrir l'offre"
                    value={f.metadata?.ctaLabel || ''}
                    onChange={e => setMeta('ctaLabel', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>URL du bouton</label>
                  <input
                    className="mono"
                    placeholder="https://rayons.cd"
                    value={f.metadata?.ctaUrl || ''}
                    onChange={e => setMeta('ctaUrl', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label>Corps du message (utilisez {'{{name}}'} et {'{{company}}'})</label>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="sm ghost"
                  onClick={() => setF({ ...f, body: (f.body ? f.body + ' ' : '') + '{{name}}' })}
                >
                  + {'{{name}}'}
                </button>
                <button
                  type="button"
                  className="sm ghost"
                  onClick={() => setF({ ...f, body: (f.body ? f.body + ' ' : '') + '{{company}}' })}
                >
                  + {'{{company}}'}
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Bonjour {{name}}, nous vous confirmons…"
              value={f.body}
              onChange={e => setF({ ...f, body: e.target.value })}
              required
            />
          </div>

          {/* APERÇU EN DIRECT DU TEMPLATE AVEC IMAGE ANIMÉE */}
          {(f.channel === 'email' || f.channel === 'rcs') && (
            <div className="email-preview-frame" style={{ marginBottom: 14 }}>
              <div
                className="email-preview-top"
                style={{ borderBottom: `3px solid ${f.metadata?.accentColor || '#1d4ed8'}` }}
              >
                <strong>Aperçu du Template ({CH[f.channel]})</strong>
                <span className="mono" style={{ fontSize: 11 }}>
                  {f.metadata?.mediaUrl ? 'Animation active' : 'Texte standard'}
                </span>
              </div>
              {f.metadata?.mediaUrl && (
                <div style={{ background: '#09090b', borderBottom: '1px solid var(--border)' }}>
                  <img
                    src={f.metadata.mediaUrl}
                    alt="Aperçu Animation"
                    style={{ width: '100%', maxHeight: 165, objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}
              <div className="email-preview-body">
                {f.metadata?.badgeText && (
                  <div style={{ marginBottom: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 99,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: `${f.metadata.accentColor || '#1d4ed8'}18`,
                        color: f.metadata.accentColor || '#1d4ed8'
                      }}
                    >
                      {f.metadata.badgeText}
                    </span>
                  </div>
                )}
                {f.metadata?.cardTitle && (
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                    {f.metadata.cardTitle.replaceAll('{{name}}', 'Amina Kabila')}
                  </div>
                )}
                <div>
                  {(f.body || 'Aperçu de votre texte…')
                    .replaceAll('{{name}}', 'Amina Kabila')
                    .replaceAll('{{company}}', 'Kivu Tech SARL')}
                </div>
                {f.metadata?.ctaLabel && (
                  <div>
                    <span
                      className="email-preview-cta"
                      style={{ background: f.metadata?.accentColor || '#1d4ed8' }}
                    >
                      {f.metadata.ctaLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="row">
            <button type="submit" className="primary" style={{ flex: 1 }}>
              {editId ? 'Enregistrer les modifications' : 'Enregistrer ce template'}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setF(emptyForm);
                }}
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function ClientAccountSettings({ meUsage, onRefreshUsage }) {
  const [d, setD] = useState(null);
  const [ok, setOk] = useState(false);
  const [copied, setCopied] = useState(false);

  const [reqForm, setReqForm] = useState({
    amountUsd: '25',
    paymentMethod: 'M-Pesa Vodacom',
    payerPhone: '+243 81 000 0000',
    reference: '',
    note: ''
  });
  const [reqNotice, setReqNotice] = useState('');
  const [reqErr, setReqErr] = useState('');

  const [blAddr, setBlAddr] = useState('');
  const [blReason, setBlReason] = useState('STOP SMS');

  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestRes, setEmailTestRes] = useState(null);
  const [testRecipient, setTestRecipient] = useState('');

  useEffect(() => {
    api('/settings').then(x => {
      setD({ ...x, settings: x.settings || {} });
      setTestRecipient(x.userEmail || '');
    });
  }, []);

  if (!d) return <div className="card mute">Chargement de votre compte…</div>;

  const setGroup = (g, k) => e =>
    setD({
      ...d,
      settings: { ...d.settings, [g]: { ...(d.settings[g] || {}), [k]: e.target.value } }
    });
  const vGroup = (g, k) => d.settings[g]?.[k] || '';

  const save = async () => {
    await api('/settings', { method: 'PUT', body: { settings: d.settings } });
    const refreshed = await api('/settings');
    setD({ ...refreshed, settings: refreshed.settings || {} });
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };

  const runEmailTest = async sendTestMail => {
    setEmailTesting(true);
    setEmailTestRes(null);
    try {
      const out = await api('/email/test-connection', {
        method: 'POST',
        body: {
          emailDirectOverride: d.settings.emailDirect || {},
          testRecipient: testRecipient || d.userEmail,
          sendTestMail
        }
      });
      setEmailTestRes(out);
    } catch (err) {
      setEmailTestRes({ error: err.message });
    } finally {
      setEmailTesting(false);
    }
  };

  const regenerateKey = async () => {
    await api('/me/regenerate-key', { method: 'POST' });
    if (onRefreshUsage) onRefreshUsage();
  };

  const submitRechargeRequest = async e => {
    e.preventDefault();
    setReqNotice('');
    setReqErr('');
    try {
      await api('/me/recharge-requests', {
        method: 'POST',
        body: reqForm
      });
      setReqNotice('Votre demande de rechargement a été transmise au C-Panel Administrateur.');
      setReqForm(prev => ({ ...prev, reference: '', note: '' }));
      if (onRefreshUsage) onRefreshUsage();
    } catch (err) {
      setReqErr(err.message);
    }
  };

  const addBlacklist = async e => {
    e.preventDefault();
    if (!blAddr.trim()) return;
    await api('/me/blacklist', {
      method: 'POST',
      body: { addr: blAddr.trim(), reason: blReason }
    });
    setBlAddr('');
    if (onRefreshUsage) onRefreshUsage();
  };

  const removeBlacklist = async id => {
    await api('/me/blacklist/' + id, { method: 'DELETE' });
    if (onRefreshUsage) onRefreshUsage();
  };

  const apiKey = meUsage?.apiKey || d.api_key || '';

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Mon Email Direct, Clé API v1, Rechargements & Liste Noire</h2>
          <p>
            Gérez votre expédition email, vos demandes de rechargement Mobile Money, votre API REST v1 et vos désabonnements STOP SMS.
          </p>
        </div>
        <div className="row">
          {ok && <span className="notice ok" style={{ padding: '6px 10px' }}>Modifications enregistrées</span>}
          <button className="primary" onClick={save}>
            Enregistrer mes paramètres
          </button>
        </div>
      </div>

      {/* DEMANDE DE RECHARGEMENT MOBILE MONEY PAR LE CLIENT */}
      <div className="split-view" style={{ marginBottom: 18 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>Mes demandes de rechargement et historique de crédits</h3>
              <p>Suivi de vos paiements Mobile Money / Banque validés par l'administrateur C-Panel.</p>
            </div>
          </div>

          {(meUsage?.rechargeRequests || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Demandes soumises au C-Panel</h4>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>Canal</th>
                      <th>Référence</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(meUsage?.rechargeRequests || []).map(r => (
                      <tr key={r.id}>
                        <td className="mute">
                          {new Date(r.created_at).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td className="mono">+${Number(r.amount_usd).toFixed(2)}</td>
                        <td>{r.payment_method}</td>
                        <td className="mono">{r.reference}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              r.status === 'approved'
                                ? 'delivered'
                                : r.status === 'rejected'
                                ? 'failed'
                                : 'queued'
                            }`}
                          >
                            <span className="status-dot" />
                            {r.status === 'approved'
                              ? 'Approuvée'
                              : r.status === 'rejected'
                              ? 'Rejetée'
                              : 'En attente C-Panel'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h4 style={{ marginBottom: 8 }}>Crédits activés sur mon compte</h4>
          {(meUsage?.creditLogs || []).length === 0 ? (
            <p className="mute">Aucun rechargement enregistré.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Montant crédité</th>
                    <th>Moyen de paiement</th>
                    <th>Référence</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(meUsage?.creditLogs || []).map(log => (
                    <tr key={log.id}>
                      <td className="mute">
                        {new Date(log.created_at).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="mono">+${Number(log.amount_usd).toFixed(2)}</td>
                      <td>{log.payment_method}</td>
                      <td className="mono">{log.reference || '—'}</td>
                      <td className="mute">{log.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="card" style={{ marginBottom: 0 }} onSubmit={submitRechargeRequest}>
          <div className="card-header">
            <div>
              <h3>Demander un rechargement Mobile Money</h3>
              <p>Transmettez votre référence de paiement au C-Panel pour augmenter votre plafond USD.</p>
            </div>
          </div>

          {reqNotice && (
            <div className="notice ok" style={{ marginBottom: 12 }}>
              {reqNotice}
            </div>
          )}
          {reqErr && (
            <div className="notice err" style={{ marginBottom: 12 }}>
              {reqErr}
            </div>
          )}

          <div className="grid-2">
            <div className="field">
              <label>Montant payé (USD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={reqForm.amountUsd}
                onChange={e => setReqForm({ ...reqForm, amountUsd: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Opérateur Mobile Money / Banque</label>
              <select
                value={reqForm.paymentMethod}
                onChange={e => setReqForm({ ...reqForm, paymentMethod: e.target.value })}
              >
                <option value="M-Pesa Vodacom">M-Pesa Vodacom</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Orange Money">Orange Money</option>
                <option value="Afrimoney">Afrimoney</option>
                <option value="Virement Bancaire">Virement Bancaire</option>
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Numéro émetteur (+243)</label>
              <input
                className="mono"
                value={reqForm.payerPhone}
                onChange={e => setReqForm({ ...reqForm, payerPhone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Référence SMS de paiement</label>
              <input
                className="mono"
                placeholder="Ex. MPESA-948271"
                value={reqForm.reference}
                onChange={e => setReqForm({ ...reqForm, reference: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Note (optionnel)</label>
            <input
              placeholder="Ex. Rechargement campagne mensuelle"
              value={reqForm.note}
              onChange={e => setReqForm({ ...reqForm, note: e.target.value })}
            />
          </div>

          <button type="submit" className="primary" style={{ width: '100%' }}>
            Envoyer la demande (+${reqForm.amountUsd} USD)
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Connexion Email Directe & Paramètres SMTP ({d.userEmail})</h3>
            <p>
              Vos emails unitaires et en masse partent directement depuis l'adresse enregistrée sur votre compte :{' '}
              <strong>{d.userEmail}</strong> ({d.smtpResolved?.providerLabel || 'Détection SMTP automatique'}).
            </p>
          </div>
          <div className="row">
            <span className="status-pill delivered">
              <span className="status-dot" />
              {d.smtpResolved?.hasPassword ? 'Transport SMTP TLS Actif' : 'Identité Directe Active'}
            </span>
            <ChannelBadge c="email" />
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Adresse expéditrice du compte (From)</label>
            <input className="mono" value={d.userEmail || ''} disabled />
          </div>
          <div className="field">
            <label>Nom d'expéditeur affiché</label>
            <input
              placeholder={meUsage?.company || 'Ex. Service Client Kivu Tech'}
              value={vGroup('emailDirect', 'fromName')}
              onChange={setGroup('emailDirect', 'fromName')}
            />
          </div>
          <div className="field">
            <label>Adresse de réponse (Reply-To)</label>
            <input
              className="mono"
              placeholder={d.userEmail || 'contact@entreprise.cd'}
              value={vGroup('emailDirect', 'replyTo')}
              onChange={setGroup('emailDirect', 'replyTo')}
            />
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label>Mot de passe d'application SMTP</label>
            <input
              type="password"
              placeholder="Mot de passe d'application Gmail / M365 / Domaine"
              value={vGroup('emailDirect', 'appPassword')}
              onChange={setGroup('emailDirect', 'appPassword')}
            />
          </div>
          <div className="field">
            <label>Serveur SMTP (auto-détecté : {d.smtpResolved?.host || 'smtp.domaine.cd'})</label>
            <input
              className="mono"
              placeholder={d.smtpResolved?.host || 'Auto-détection selon votre email'}
              value={vGroup('emailDirect', 'host')}
              onChange={setGroup('emailDirect', 'host')}
            />
          </div>
          <div className="field">
            <label>Port & Sécurité TLS/SSL</label>
            <select
              value={vGroup('emailDirect', 'port') || String(d.smtpResolved?.port || '587')}
              onChange={setGroup('emailDirect', 'port')}
            >
              <option value="587">Port 587 — STARTTLS (Standard)</option>
              <option value="465">Port 465 — SSL/TLS Direct (Gmail / Zoho)</option>
              <option value="2525">Port 2525 — Relais Alternatif</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Signature automatique ajoutée en bas de vos emails</label>
          <textarea
            rows={2}
            placeholder="Cordialement, L'équipe Service Client — Kinshasa, RDC"
            value={vGroup('emailDirect', 'signature')}
            onChange={setGroup('emailDirect', 'signature')}
          />
        </div>

        <div className="route-block" style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>Tester la connexion de votre compte Email ({d.userEmail})</strong>
              <div className="mute" style={{ fontSize: 12 }}>
                Vérifiez l'authentification SMTP ou envoyez un email HTML de vérification avec suivi d'ouverture.
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input
                style={{ width: 230 }}
                className="mono"
                placeholder="Destinataire du test"
                value={testRecipient}
                onChange={e => setTestRecipient(e.target.value)}
              />
              <button
                type="button"
                className="sm"
                disabled={emailTesting}
                onClick={() => runEmailTest(false)}
              >
                {emailTesting ? 'Vérification…' : 'Vérifier la connexion SMTP'}
              </button>
              <button
                type="button"
                className="sm primary"
                disabled={emailTesting}
                onClick={() => runEmailTest(true)}
              >
                Envoyer un email de test
              </button>
            </div>
          </div>

          {emailTestRes && (
            <div
              className={`notice ${emailTestRes.error ? 'err' : 'ok'}`}
              style={{ marginTop: 10 }}
            >
              {emailTestRes.error ? (
                emailTestRes.error
              ) : (
                <div>
                  <strong>{emailTestRes.providerLabel}</strong> ({emailTestRes.host}:{emailTestRes.port} •{' '}
                  {emailTestRes.latencyMs} ms) — {emailTestRes.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>API REST Client v1 & Webhook Sortant Signé (HMAC-SHA256)</h3>
            <p>
              Intégrez Rayons CRM à votre ERP ou site web et recevez les événements signés (X-Rayons-Signature).
            </p>
          </div>
          <div className="row">
            <button
              type="button"
              className="sm"
              onClick={() => {
                navigator.clipboard?.writeText(apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copiée' : 'Copier la clé'}
            </button>
            <button type="button" className="sm" onClick={regenerateKey}>
              Régénérer
            </button>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Votre clé X-API-Key</label>
            <input className="mono" value={apiKey} readOnly />
          </div>
          <div className="field">
            <label>URL de votre Webhook Client (pour recevoir les DLR & réponses MO)</label>
            <input
              className="mono"
              placeholder="https://api.votre-entreprise.cd/webhooks/rayons-dlr"
              value={d.settings.clientWebhookUrl || ''}
              onChange={e =>
                setD({
                  ...d,
                  settings: { ...d.settings, clientWebhookUrl: e.target.value }
                })
              }
            />
          </div>
        </div>
        <div className="notice mono" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          <div>1. Solde & Quotas : GET {API}/api/v1/balance (Header X-API-Key: {apiKey})</div>
          <div>2. Envoi unitaire : POST {API}/api/v1/send — {'{"channel":"sms","to":"+243812345678","body":"Bonjour"}'}</div>
          <div>3. Envoi groupé : POST {API}/api/v1/send-bulk — {'{"channel":"sms","recipients":[{"to":"+24381...","name":"Amina"}],"body":"Bonjour {{name}}"}'}</div>
          <div>4. Statut DLR : GET {API}/api/v1/messages/RAY-1001</div>
        </div>
      </div>

      {/* LISTE NOIRE / DÉSABONNEMENTS STOP SMS */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Liste Noire & Désabonnements automatiques (STOP SMS)</h3>
            <p>
              Les abonnés qui répondent « STOP » ou « ARRET » par SMS sont automatiquement inscrits ici et bloqués lors des prochains envois.
            </p>
          </div>
        </div>

        <form className="row" style={{ marginBottom: 14 }} onSubmit={addBlacklist}>
          <input
            style={{ maxWidth: 260 }}
            className="mono"
            placeholder="+243 81 000 0000 ou email"
            value={blAddr}
            onChange={e => setBlAddr(e.target.value)}
            required
          />
          <input
            style={{ maxWidth: 240 }}
            placeholder="Motif (ex. Demande client)"
            value={blReason}
            onChange={e => setBlReason(e.target.value)}
          />
          <button type="submit">Bloquer ce numéro / email</button>
        </form>

        {(meUsage?.blacklist || []).length === 0 ? (
          <p className="mute">Aucun numéro ou email dans la liste noire.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Numéro / Adresse bloquée</th>
                  <th>Motif</th>
                  <th>Date d'inscription</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(meUsage?.blacklist || []).map(b => (
                  <tr key={b.id}>
                    <td className="mono cell-main">{b.addr}</td>
                    <td>{b.reason}</td>
                    <td className="mute">
                      {new Date(b.created_at).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="sm danger"
                        onClick={() => removeBlacklist(b.id)}
                      >
                        Débloquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- ANALYSEUR CSV DE CONTACTS ---------- */
function parseCsvContacts(rawText = '') {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0];
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const splitLine = line =>
    line
      .split(sep)
      .map(cell => cell.trim().replace(/^"|"$/g, ''));

  const headerCells = splitLine(first).map(h => h.toLowerCase());
  const hasHeader =
    headerCells.some(h => ['nom', 'name', 'contact', 'client'].includes(h)) ||
    headerCells.some(h => ['telephone', 'téléphone', 'phone', 'tel', 'msisdn', 'email', 'mail'].includes(h));

  const startIdx = hasHeader ? 1 : 0;
  const idxName = hasHeader
    ? headerCells.findIndex(h => ['nom', 'name', 'contact', 'client', 'fullname'].includes(h))
    : 0;
  const idxPhone = hasHeader
    ? headerCells.findIndex(h => ['telephone', 'téléphone', 'phone', 'tel', 'msisdn', 'numero', 'numéro'].includes(h))
    : 1;
  const idxEmail = hasHeader
    ? headerCells.findIndex(h => ['email', 'mail', 'courriel'].includes(h))
    : 2;
  const idxTags = hasHeader
    ? headerCells.findIndex(h => ['tags', 'tag', 'segment', 'segments', 'groupe', 'categorie'].includes(h))
    : 3;
  const idxNotes = hasHeader
    ? headerCells.findIndex(h => ['notes', 'note', 'commentaire'].includes(h))
    : 4;

  const parsed = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const name = cols[idxName >= 0 ? idxName : 0] || '';
    const phone = idxPhone >= 0 ? cols[idxPhone] || '' : cols[1] || '';
    const email = idxEmail >= 0 ? cols[idxEmail] || '' : cols[2] || '';
    const rawTags = idxTags >= 0 ? cols[idxTags] || '' : cols[3] || '';
    const notes = idxNotes >= 0 ? cols[idxNotes] || '' : cols[4] || '';
    if (!name && !phone && !email) continue;
    const opLabel = detectOperatorLabel(phone);
    const tagList = rawTags
      .split(/[|/,]/)
      .map(t => t.trim())
      .filter(Boolean);
    parsed.push({
      name: name || phone || email,
      phone,
      email,
      tags: tagList,
      notes,
      operator: opLabel
    });
  }
  return parsed;
}

/* ---------- CONTACTS, IMPORT CSV & CIBLAGE PAR SEGMENT / OPÉRATEUR ---------- */
function Contacts({ userEmail, meUsage, onRefreshUsage, initialTemplate }) {
  const [list, setList] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [opFilter, setOpFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');

  const [f, setF] = useState({ name: '', phone: '', email: '', tagsText: '', notes: '' });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [sel, setSel] = useState([]);
  const [m, setM] = useState({
    channel: 'sms',
    subject: '',
    body: '',
    scheduledAt: '',
    metadata: {
      cardTitle: '',
      mediaUrl: '',
      ctaLabel: '',
      ctaUrl: '',
      ctaPhone: '',
      quickReplies: 'Confirmer,Être rappelé',
      smsFallback: true
    }
  });
  const [res, setRes] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [sending, setSending] = useState(false);
  const [hist, setHist] = useState(null);

  const load = useCallback(() => {
    api('/contacts?search=' + encodeURIComponent(search)).then(setList).catch(console.error);
    api('/templates').then(setTemplates).catch(console.error);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialTemplate) {
      setM(prev => ({
        channel: initialTemplate.channel || 'sms',
        subject: initialTemplate.subject || '',
        body: initialTemplate.body || '',
        scheduledAt: '',
        metadata: {
          ...prev.metadata,
          ...(initialTemplate.metadata || {})
        }
      }));
    }
  }, [initialTemplate]);

  const enrichedList = list.map(c => ({
    ...c,
    operatorLabel: detectOperatorLabel(c.phone) || 'Sans numéro'
  }));

  const operatorCounts = enrichedList.reduce((acc, c) => {
    acc[c.operatorLabel] = (acc[c.operatorLabel] || 0) + 1;
    return acc;
  }, {});

  const tagCounts = enrichedList.reduce((acc, c) => {
    for (const t of c.tags || []) {
      acc[t] = (acc[t] || 0) + 1;
    }
    return acc;
  }, {});

  const filteredList = enrichedList.filter(c => {
    if (opFilter !== 'all' && c.operatorLabel !== opFilter) return false;
    if (tagFilter !== 'all' && !(c.tags || []).includes(tagFilter)) return false;
    return true;
  });

  const saveContact = async e => {
    e.preventDefault();
    setFormErr('');
    if (!f.name.trim()) return;
    try {
      const tags = (f.tagsText || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      const payload = { name: f.name, phone: f.phone, email: f.email, tags, notes: f.notes };
      if (editId) {
        await api('/contacts/' + editId, { method: 'PUT', body: payload });
      } else {
        await api('/contacts', { method: 'POST', body: payload });
      }
      setF({ name: '', phone: '', email: '', tagsText: '', notes: '' });
      setEditId(null);
      setShowForm(false);
      load();
      if (onRefreshUsage) onRefreshUsage();
    } catch (err) {
      setFormErr(err.message);
    }
  };

  const previewRows = parseCsvContacts(csvText);

  const handleFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setCsvText(String(ev.target?.result || ''));
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const downloadCsvTemplate = () => {
    const sample = [
      'Nom,Telephone,Email,Tags,Notes',
      'Amina Kabila,+243 81 234 5678,amina@kivu.cd,VIP|Kinshasa,Cliente entreprise',
      'Marc Ilunga,+243 99 876 5432,marc@horizon.cd,Prospect|Lubumbashi,Offre Business',
      'Sarah Mbemba,+243 84 451 2893,sarah@atelier.cd,Partenaire|Kinshasa,Relance mensuelle',
      'David Kasongo,+243 90 111 2233,david@finacom.cd,Client|Goma,Support prioritaire'
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-contacts-rayons-crm.csv';
    a.click();
  };

  const exportContactsCsv = () => {
    const headers = ['Nom', 'Telephone', 'Operateur', 'Email', 'Segments', 'Notes'];
    const rows = filteredList.map(c => [
      `"${(c.name || '').replaceAll('"', '""')}"`,
      c.phone || '',
      c.operatorLabel || '',
      c.email || '',
      `"${(c.tags || []).join(' | ')}"`,
      `"${(c.notes || '').replaceAll('"', '""')}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-rayons-crm.csv';
    a.click();
  };

  const runCsvImport = async () => {
    if (previewRows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setFormErr('');
    try {
      const out = await api('/contacts/import', {
        method: 'POST',
        body: { contacts: previewRows }
      });
      setImportResult(out);
      setCsvText('');
      load();
      if (onRefreshUsage) onRefreshUsage();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setImporting(false);
    }
  };

  const send = async () => {
    setSending(true);
    setRes(null);
    try {
      const out = await api('/messages/send', {
        method: 'POST',
        body: { ...m, contactIds: sel }
      });
      setRes(out);
      if (onRefreshUsage) onRefreshUsage();
    } catch (e) {
      setRes({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  const toggle = id =>
    setSel(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

  const toggleAllFiltered = () => {
    const filteredIds = filteredList.map(c => c.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => sel.includes(id));
    if (allSelected) {
      setSel(sel.filter(id => !filteredIds.includes(id)));
    } else {
      setSel(Array.from(new Set([...sel, ...filteredIds])));
    }
  };

  const selectByOperator = opLabel => {
    const ids = enrichedList.filter(c => c.operatorLabel === opLabel).map(c => c.id);
    setOpFilter(opLabel);
    setSel(ids);
  };

  const selectByTag = tag => {
    const ids = enrichedList.filter(c => (c.tags || []).includes(tag)).map(c => c.id);
    setTagFilter(tag);
    setSel(ids);
  };

  const selectedContacts = enrichedList.filter(c => sel.includes(c.id));
  const selectedByOp = selectedContacts.reduce((acc, c) => {
    acc[c.operatorLabel] = (acc[c.operatorLabel] || 0) + 1;
    return acc;
  }, {});

  const unitCostEstimate =
    m.channel === 'email' ? 0 : m.channel === 'rcs' ? 0.02 : m.channel === 'whatsapp' ? 0.008 : 0.015;
  const estimatedCost = (selectedContacts.length * unitCostEstimate).toFixed(3);

  const allowedChannels = meUsage?.limits?.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];
  const sampleContactName = selectedContacts[0]?.name || list[0]?.name || 'Amina';

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Contacts, import CSV et envoi ciblé</h2>
          <p>
            Quota contacts : {meUsage?.usage?.contacts || list.length} / {meUsage?.limits?.maxContacts || 500} • Sender ID : {meUsage?.senderId || 'RAYONS'}
          </p>
        </div>
        <div className="row">
          <button onClick={exportContactsCsv}>Exporter CSV ({filteredList.length})</button>
          <button
            onClick={() => {
              setShowImport(!showImport);
              setShowForm(false);
              setFormErr('');
            }}
          >
            {showImport ? 'Fermer l’import' : 'Importer CSV'}
          </button>
          <button
            className="primary"
            onClick={() => {
              setEditId(null);
              setFormErr('');
              setShowImport(false);
              setShowForm(!showForm);
            }}
          >
            {showForm ? 'Fermer' : 'Ajouter un contact'}
          </button>
        </div>
      </div>

      {importResult && (
        <div className="notice ok" style={{ marginBottom: 16 }}>
          Import terminé : <strong>{importResult.imported}</strong> nouveau(x) contact(s) ajouté(s),{' '}
          <strong>{importResult.updated}</strong> mis à jour, <strong>{importResult.skipped}</strong> ignoré(s). Total :{' '}
          <span className="mono">{importResult.totalContacts} / {importResult.maxContacts}</span>.
        </div>
      )}

      {showImport && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Importer des contacts par fichier CSV</h3>
              <p>
                Détection automatique de l'opérateur télécom (Vodacom, Airtel, Orange, Africell), dédoublonnage et attribution des segments.
              </p>
            </div>
            <button type="button" className="sm" onClick={downloadCsvTemplate}>
              Télécharger un modèle CSV
            </button>
          </div>

          {formErr && (
            <div className="notice err" style={{ marginBottom: 14 }}>
              {formErr}
            </div>
          )}

          <div className="upload-zone">
            <div>
              <strong>Sélectionner un fichier CSV ou TXT depuis votre ordinateur</strong>
              <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>
                Colonnes reconnues : Nom, Téléphone, Email, Tags / Segments, Notes
              </div>
            </div>
            <input
              type="file"
              accept=".csv,.txt"
              style={{ width: 'auto' }}
              onChange={handleFileUpload}
            />
          </div>

          <div className="field">
            <label>Ou collez directement vos lignes CSV ci-dessous</label>
            <textarea
              rows={4}
              className="mono"
              placeholder={'Nom,Telephone,Email,Tags,Notes\nAmina Kabila,+243 81 234 5678,amina@kivu.cd,VIP|Kinshasa,Cliente entreprise'}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
          </div>

          {previewRows.length > 0 && (
            <div style={{ marginTop: 12, marginBottom: 14 }}>
              <strong>Aperçu : {previewRows.length} contact(s) détecté(s)</strong>
              <div className="table-container" style={{ maxHeight: 180, marginTop: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>Opérateur détecté</th>
                      <th>Email</th>
                      <th>Segments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 6).map((r, idx) => (
                      <tr key={idx}>
                        <td className="cell-main">{r.name}</td>
                        <td className="mono">{r.phone || '—'}</td>
                        <td>
                          <span className="badge neutral">{r.operator || '—'}</span>
                        </td>
                        <td className="mute">{r.email || '—'}</td>
                        <td>{(r.tags || []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={previewRows.length === 0 || importing}
              onClick={runCsvImport}
            >
              {importing ? 'Importation…' : `Importer ${previewRows.length} contact(s)`}
            </button>
            <button type="button" onClick={() => setShowImport(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={saveContact}>
          <div className="card-header">
            <h3>{editId ? 'Modifier le contact' : 'Nouveau contact'}</h3>
          </div>
          {formErr && (
            <div className="notice err" style={{ marginBottom: 14 }}>
              {formErr}
            </div>
          )}
          <div className="grid-auto" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Nom complet</label>
              <input
                placeholder="Ex. Amina Kabila"
                value={f.name}
                onChange={e => setF({ ...f, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Téléphone</label>
              <input
                placeholder="+243 81 234 5678"
                value={f.phone}
                onChange={e => setF({ ...f, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="nom@domaine.cd"
                value={f.email}
                onChange={e => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Segments / Tags</label>
              <input
                placeholder="VIP, Kinshasa"
                value={f.tagsText}
                onChange={e => setF({ ...f, tagsText: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <button type="submit" className="primary">
              Enregistrer le contact
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="split-view">
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="filter-bar">
            <div className="filter-chips">
              <span className="mute" style={{ fontSize: 12, fontWeight: 500, marginRight: 4 }}>
                Opérateur :
              </span>
              <button
                type="button"
                className={`chip ${opFilter === 'all' ? 'active' : ''}`}
                onClick={() => setOpFilter('all')}
              >
                Tous <span className="chip-count">({enrichedList.length})</span>
              </button>
              {['Vodacom RDC', 'Airtel RDC', 'Orange RDC', 'Africell RDC'].map(op => {
                const count = operatorCounts[op] || 0;
                return (
                  <button
                    key={op}
                    type="button"
                    className={`chip ${opFilter === op ? 'active' : ''}`}
                    onClick={() => setOpFilter(op)}
                  >
                    {op.replace(' RDC', '')} <span className="chip-count">({count})</span>
                  </button>
                );
              })}
            </div>

            {Object.keys(tagCounts).length > 0 && (
              <div className="filter-chips">
                <span className="mute" style={{ fontSize: 12, fontWeight: 500, marginRight: 4 }}>
                  Segment :
                </span>
                <button
                  type="button"
                  className={`chip ${tagFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTagFilter('all')}
                >
                  Tous
                </button>
                {Object.entries(tagCounts).map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    className={`chip ${tagFilter === tag ? 'active' : ''}`}
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag} <span className="chip-count">({count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card-header">
            <input
              style={{ maxWidth: 260 }}
              placeholder="Rechercher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="row">
              <button className="sm" onClick={toggleAllFiltered}>
                {filteredList.length > 0 && filteredList.every(c => sel.includes(c.id))
                  ? 'Désélectionner la vue'
                  : `Sélectionner la vue (${filteredList.length})`}
              </button>
              {sel.length > 0 && (
                <button className="sm ghost" onClick={() => setSel([])}>
                  Vider ({sel.length})
                </button>
              )}
            </div>
          </div>

          {filteredList.length === 0 ? (
            <p className="mute" style={{ padding: '16px 0' }}>
              Aucun contact trouvé.
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={
                          filteredList.length > 0 &&
                          filteredList.every(c => sel.includes(c.id))
                        }
                        onChange={toggleAllFiltered}
                      />
                    </th>
                    <th>Nom et segments</th>
                    <th>Téléphone et opérateur</th>
                    <th>Email</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map(c => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={sel.includes(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td>
                        <div className="cell-main">{c.name}</div>
                        {c.tags?.length > 0 && (
                          <div className="cell-sub">{c.tags.join(' • ')}</div>
                        )}
                      </td>
                      <td>
                        {c.phone ? (
                          <div className="row" style={{ gap: 6 }}>
                            <span className="mono">{c.phone}</span>
                            {c.operatorLabel && (
                              <span className="badge neutral">{c.operatorLabel}</span>
                            )}
                          </div>
                        ) : (
                          <span className="mute">—</span>
                        )}
                      </td>
                      <td className="mute">{c.email || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="sm"
                          onClick={async () => {
                            const msgs = await api('/messages?contactId=' + c.id);
                            setHist({ c, msgs });
                          }}
                        >
                          Historique
                        </button>{' '}
                        <button
                          className="sm danger"
                          onClick={async () => {
                            await api('/contacts/' + c.id, { method: 'DELETE' });
                            setSel(sel.filter(id => id !== c.id));
                            load();
                            if (onRefreshUsage) onRefreshUsage();
                          }}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card sticky-panel" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>Studio d'envoi ciblé</h3>
              <p>{sel.length} destinataire(s) sélectionné(s)</p>
            </div>
            <ChannelBadge c={m.channel} />
          </div>

          <div className="target-box">
            <div className="target-box-title">Ciblage rapide en 1 clic</div>
            <div className="filter-chips">
              {['Vodacom RDC', 'Airtel RDC', 'Orange RDC', 'Africell RDC'].map(op => {
                const count = operatorCounts[op] || 0;
                if (!count) return null;
                return (
                  <button
                    key={op}
                    type="button"
                    className="chip"
                    onClick={() => selectByOperator(op)}
                  >
                    Cibler {op.replace(' RDC', '')} <span className="chip-count">({count})</span>
                  </button>
                );
              })}
              {Object.entries(tagCounts).map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  className="chip"
                  onClick={() => selectByTag(tag)}
                >
                  Segment {tag} <span className="chip-count">({count})</span>
                </button>
              ))}
            </div>
          </div>

          {templates.length > 0 && (
            <div className="field">
              <label>Charger un modèle de message</label>
              <select
                defaultValue=""
                onChange={e => {
                  const t = templates.find(x => String(x.id) === e.target.value);
                  if (t) {
                    setM(prev => ({
                      ...prev,
                      channel: t.channel || prev.channel,
                      subject: t.subject || '',
                      body: t.body || '',
                      metadata: {
                        ...prev.metadata,
                        ...(t.metadata || {})
                      }
                    }));
                  }
                }}
              >
                <option value="">— Choisir un modèle enregistré —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    [{CH[t.channel]}] {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="channel-selector">
            {Object.entries(CH).map(([k, label]) => {
              const isAllowed = allowedChannels.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!isAllowed}
                  className={`channel-btn ${m.channel === k ? 'active' : ''}`}
                  onClick={() => setM({ ...m, channel: k })}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {m.channel === 'email' ? (
            <>
              <div className="notice" style={{ marginBottom: 12 }}>
                Expéditeur direct : <strong>{userEmail}</strong> ({meUsage?.company || 'Rayons CRM'}) • Suivi d'ouverture & visuels animés actifs
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Objet de l'email</label>
                  <input
                    placeholder="Objet du message (supporte {{name}})"
                    value={m.subject}
                    onChange={e => setM({ ...m, subject: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Titre mis en avant dans l'email (optionnel)</label>
                  <input
                    placeholder="Ex. Offre Flash Entreprise -30%"
                    value={m.metadata?.cardTitle || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, cardTitle: e.target.value } })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ marginBottom: 0 }}>
                    Image qui bouge / Bannière Animée (GIF / SVG Animé)
                  </label>
                  <div className="filter-chips" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className={`chip ${!m.metadata?.mediaUrl ? 'active' : ''}`}
                      onClick={() => setM({ ...m, metadata: { ...m.metadata, mediaUrl: '' } })}
                    >
                      Aucune
                    </button>
                    {ANIMATED_MEDIA_GALLERY.map(anim => (
                      <button
                        key={anim.id}
                        type="button"
                        className={`chip ${m.metadata?.mediaUrl === anim.url ? 'active' : ''}`}
                        onClick={() =>
                          setM({
                            ...m,
                            metadata: {
                              ...m.metadata,
                              mediaUrl: anim.url,
                              cardTitle: m.metadata?.cardTitle || anim.label
                            }
                          })
                        }
                      >
                        {anim.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="mono"
                  placeholder="URL d'un GIF animé (.gif) ou bannière animée..."
                  value={m.metadata?.mediaUrl || ''}
                  onChange={e =>
                    setM({ ...m, metadata: { ...m.metadata, mediaUrl: e.target.value } })
                  }
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Bouton d'action CTA (optionnel)</label>
                  <input
                    placeholder="Ex. Voir ma facture"
                    value={m.metadata?.ctaLabel || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, ctaLabel: e.target.value } })
                    }
                  />
                </div>
                <div className="field">
                  <label>Lien URL du bouton CTA</label>
                  <input
                    className="mono"
                    placeholder="https://..."
                    value={m.metadata?.ctaUrl || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, ctaUrl: e.target.value } })
                    }
                  />
                </div>
              </div>
            </>
          ) : m.channel === 'rcs' ? (
            <>
              <div className="notice" style={{ marginBottom: 12 }}>
                <div>
                  Agent RCS Vérifié : <strong className="mono">{meUsage?.senderId || 'RAYONS_RCS'}</strong> • Repli SMS automatique actif
                </div>
                {selectedContacts.length > 0 && (
                  <div className="mute" style={{ marginTop: 4, fontSize: 12 }}>
                    Coût estimé Carte Riche RCS : <span className="mono">${estimatedCost} USD</span>
                  </div>
                )}
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Titre de la Carte Riche RCS</label>
                  <input
                    placeholder="Ex. Offre Spéciale Entreprise"
                    value={m.metadata?.cardTitle || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, cardTitle: e.target.value } })
                    }
                  />
                </div>
                <div className="field">
                  <label>Image / Bannière Animée (URL ou Galerie)</label>
                  <input
                    className="mono"
                    placeholder="https://images.unsplash.com/..."
                    value={m.metadata?.mediaUrl || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, mediaUrl: e.target.value } })
                    }
                  />
                </div>
              </div>
              <div className="filter-chips" style={{ marginBottom: 10 }}>
                <span className="mute" style={{ fontSize: 11 }}>
                  Bannière animée :
                </span>
                {ANIMATED_MEDIA_GALLERY.map(anim => (
                  <button
                    key={anim.id}
                    type="button"
                    className={`chip ${m.metadata?.mediaUrl === anim.url ? 'active' : ''}`}
                    onClick={() =>
                      setM({
                        ...m,
                        metadata: { ...m.metadata, mediaUrl: anim.url }
                      })
                    }
                  >
                    {anim.label.split(' ')[0]}
                  </button>
                ))}
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Bouton Lien Web (Texte)</label>
                  <input
                    placeholder="Ex. Ouvrir l'offre"
                    value={m.metadata?.ctaLabel || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, ctaLabel: e.target.value } })
                    }
                  />
                </div>
                <div className="field">
                  <label>URL du bouton</label>
                  <input
                    className="mono"
                    placeholder="https://rayons.cd"
                    value={m.metadata?.ctaUrl || ''}
                    onChange={e =>
                      setM({ ...m, metadata: { ...m.metadata, ctaUrl: e.target.value } })
                    }
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="notice" style={{ marginBottom: 12 }}>
              <div>
                Route télécom partagée • Sender ID :{' '}
                <strong className="mono">{meUsage?.senderId || 'RAYONS'}</strong>
              </div>
              {selectedContacts.length > 0 && (
                <div className="mute" style={{ marginTop: 4, fontSize: 12 }}>
                  Répartition :{' '}
                  {Object.entries(selectedByOp)
                    .map(([op, n]) => `${n} ${op.replace(' RDC', '')}`)
                    .join(', ')}{' '}
                  • Coût estimé : <span className="mono">${estimatedCost} USD</span>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label>Message</label>
              <button
                type="button"
                className="sm ghost"
                onClick={() =>
                  setM({ ...m, body: (m.body ? m.body + ' ' : '') + '{{name}}' })
                }
              >
                Insérer {'{{name}}'}
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Votre message…"
              value={m.body}
              onChange={e => setM({ ...m, body: e.target.value })}
            />
          </div>

          {m.body && m.channel === 'rcs' ? (
            <div className="rcs-preview-frame">
              <div className="rcs-agent-header">
                <strong>{meUsage?.company || 'Rayons CRM'}</strong>
                <span className="rcs-verified-pill">Agent RCS Vérifié</span>
              </div>
              <div className="rcs-card-box">
                {m.metadata?.mediaUrl && (
                  <img
                    className="rcs-card-media"
                    src={m.metadata.mediaUrl}
                    alt="Aperçu RCS"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="rcs-card-content">
                  {m.metadata?.cardTitle && (
                    <div className="rcs-card-title">
                      {m.metadata.cardTitle.replaceAll('{{name}}', sampleContactName)}
                    </div>
                  )}
                  <div className="rcs-card-desc">
                    {m.body.replaceAll('{{name}}', sampleContactName)}
                  </div>
                </div>
                {m.metadata?.ctaLabel && (
                  <div className="rcs-card-actions">
                    <div className="rcs-action-row">{m.metadata.ctaLabel}</div>
                  </div>
                )}
              </div>
            </div>
          ) : m.body && m.channel === 'email' ? (
            <div className="email-preview-frame">
              <div
                className="email-preview-top"
                style={
                  m.metadata?.accentColor ? { background: m.metadata.accentColor } : undefined
                }
              >
                <strong>{meUsage?.company || 'Rayons CRM'}</strong>
                <span className="mono" style={{ fontSize: 11, opacity: 0.85 }}>
                  {userEmail}
                </span>
              </div>
              {m.metadata?.mediaUrl && (
                <div style={{ background: '#090d16', borderBottom: '1px solid var(--border)' }}>
                  <img
                    src={m.metadata.mediaUrl}
                    alt="Bannière animée email"
                    style={{
                      width: '100%',
                      maxHeight: 165,
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                </div>
              )}
              <div className="email-preview-body">
                {m.metadata?.cardTitle && (
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#09090b', marginBottom: 4 }}>
                    {m.metadata.cardTitle.replaceAll('{{name}}', sampleContactName)}
                  </div>
                )}
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, color: '#52525b' }}>
                  Objet : {(m.subject || '(Sans objet)').replaceAll('{{name}}', sampleContactName)}
                </div>
                <div style={{ whiteSpace: 'pre-line' }}>
                  {m.body.replaceAll('{{name}}', sampleContactName)}
                </div>
                {m.metadata?.ctaLabel && (
                  <div>
                    <span
                      className="email-preview-cta"
                      style={
                        m.metadata?.accentColor
                          ? { background: m.metadata.accentColor }
                          : undefined
                      }
                    >
                      {m.metadata.ctaLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : m.body ? (
            <div className="message-preview">
              {m.body.replaceAll('{{name}}', sampleContactName)}
            </div>
          ) : null}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Planifier l'envoi (optionnel — exécution par le Worker Backend)</label>
            <input
              type="datetime-local"
              value={m.scheduledAt || ''}
              onChange={e => setM({ ...m, scheduledAt: e.target.value })}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              className="primary"
              style={{ width: '100%' }}
              disabled={!sel.length || !m.body || sending}
              onClick={send}
            >
              {sending
                ? 'Transmission…'
                : m.scheduledAt
                ? `Planifier pour ${sel.length} contact(s)`
                : `Envoyer à ${sel.length} contact(s)`}
            </button>
          </div>

          {res && (
            <div style={{ marginTop: 12 }}>
              {res.error ? (
                <div className="notice err">{res.error}</div>
              ) : (
                <div className="notice ok">
                  {res.scheduled > 0
                    ? `${res.scheduled} message(s) planifié(s) dans la file d'attente backend`
                    : `${res.sent} transaction(s) envoyée(s)`}
                  {res.results?.[0]?.operator && ` via ${res.results[0].operator}`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hist && (
        <div className="modal-overlay" onClick={() => setHist(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Fil de conversation & DLR — {hist.c.name}</h3>
                <p className="mute" style={{ fontSize: 12 }}>
                  {hist.c.phone || hist.c.email} • {hist.c.operatorLabel || ''}
                </p>
              </div>
              <div className="row">
                <button
                  className="sm"
                  onClick={async () => {
                    const msgs = await api('/messages?contactId=' + hist.c.id);
                    setHist({ ...hist, msgs });
                  }}
                >
                  Actualiser DLR
                </button>
                <button className="sm ghost" onClick={() => setHist(null)}>
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="modal-content">
              {hist.msgs.length === 0 ? (
                <p className="mute">Aucun échange enregistré pour ce contact.</p>
              ) : (
                hist.msgs.map(x => (
                  <div key={x.id} className={`thread-item ${x.direction}`}>
                    <div className="thread-meta">
                      <div className="row" style={{ gap: 6 }}>
                        <ChannelBadge c={x.channel} />
                        <span>{x.operator}</span>
                        {x.dlr_code && (
                          <span className="badge neutral mono">{x.dlr_code}</span>
                        )}
                      </div>
                      <span className="mono">{x.tx_ref}</span>
                    </div>
                    <div>{x.body}</div>
                    <div className="thread-meta">
                      <div className="row" style={{ gap: 8 }}>
                        <StatusIndicator status={x.status} />
                        {x.latency_ms ? (
                          <span className="mono mute">{x.latency_ms} ms</span>
                        ) : null}
                      </div>
                      <span>
                        {new Date(x.created_at).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}

              <form
                style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}
                onSubmit={async e => {
                  e.preventDefault();
                  const replyText = e.target.elements.replyBody.value.trim();
                  const replyCh = e.target.elements.replyChannel.value;
                  if (!replyText) return;
                  await api('/messages/send', {
                    method: 'POST',
                    body: { channel: replyCh, contactIds: [hist.c.id], body: replyText }
                  });
                  e.target.reset();
                  const msgs = await api('/messages?contactId=' + hist.c.id);
                  setHist({ ...hist, msgs });
                  if (onRefreshUsage) onRefreshUsage();
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <select name="replyChannel" defaultValue="sms" style={{ width: 150 }}>
                    {Object.entries(CH)
                      .filter(([k]) => allowedChannels.includes(k))
                      .map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                  </select>
                  <input
                    name="replyBody"
                    placeholder={`Répondre directement à ${hist.c.name}…`}
                    style={{ flex: 1 }}
                    required
                  />
                  <button type="submit" className="primary">
                    Envoyer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- JOURNAL DES TRANSACTIONS (C-PANEL GLOBAL OU ESPACE CLIENT) ---------- */
function TransactionsStats({ isGlobalCPanel }) {
  const [stats, setStats] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [channelFilter, setChannelFilter] = useState('all');
  const [opFilter, setOpFilter] = useState('all');
  const [qText, setQText] = useState('');

  const load = useCallback(() => {
    const qParam = isGlobalCPanel ? '?allTenants=1' : '';
    api('/stats' + qParam).then(setStats).catch(console.error);
    api('/messages' + qParam).then(setMsgs).catch(console.error);
  }, [isGlobalCPanel]);

  useEffect(() => {
    load();
  }, [load]);

  if (!stats) return <div className="card mute">Chargement des transactions…</div>;

  const operators = Array.from(new Set(msgs.map(m => m.operator).filter(Boolean)));

  const filtered = msgs.filter(m => {
    if (channelFilter !== 'all' && m.channel !== channelFilter) return false;
    if (opFilter !== 'all' && m.operator !== opFilter) return false;
    if (qText) {
      const s = qText.toLowerCase();
      return (
        (m.tx_ref || '').toLowerCase().includes(s) ||
        (m.tenant_name || '').toLowerCase().includes(s) ||
        (m.contact_name || '').toLowerCase().includes(s) ||
        (m.addr || '').toLowerCase().includes(s) ||
        (m.operator || '').toLowerCase().includes(s) ||
        (m.dlr_code || '').toLowerCase().includes(s) ||
        (m.body || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  const exportCsv = () => {
    const headers = ['Ref', 'Date', 'Client', 'Canal', 'Operateur', 'Direction', 'Expediteur', 'Destinataire', 'Code_DLR', 'Latence_ms', 'Statut', 'Cout_USD', 'Message'];
    const rows = filtered.map(m => [
      m.tx_ref || `RAY-${1000 + m.id}`,
      new Date(m.created_at).toISOString(),
      m.tenant_name || '',
      m.channel,
      m.operator || '',
      m.direction,
      m.sender_addr || '',
      m.addr || '',
      m.dlr_code || '',
      m.latency_ms || 0,
      m.status || '',
      Number(m.cost || 0).toFixed(4),
      `"${(m.body || '').replaceAll('"', '""')}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rayons-crm-transactions.csv';
    a.click();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>
            {isGlobalCPanel
              ? 'Audit Global des Transactions & DLR (Tous les clients SaaS)'
              : 'Mes Transactions, Accusés DLR et Statistiques'}
          </h2>
          <p>
            Historique détaillé des envois, réceptions et accusés de livraison opérateurs (DLR) par route télécom.
          </p>
        </div>
        <div className="row">
          <button onClick={load}>Actualiser</button>
          <button className="primary" onClick={exportCsv}>
            Exporter CSV ({filtered.length})
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Transactions ({filtered.length})</h3>
          <div className="row">
            <select
              style={{ width: 160 }}
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value)}
            >
              <option value="all">Tous les canaux</option>
              {Object.entries(CH).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              style={{ width: 190 }}
              value={opFilter}
              onChange={e => setOpFilter(e.target.value)}
            >
              <option value="all">Tous les opérateurs</option>
              {operators.map(op => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>

            <input
              style={{ width: 220 }}
              placeholder="Rechercher réf, DLR, contact, numéro…"
              value={qText}
              onChange={e => setQText(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                {isGlobalCPanel && <th>Client SaaS</th>}
                <th>Canal</th>
                <th>Opérateur / Route</th>
                <th>Expéditeur → Destinataire</th>
                <th>Message</th>
                <th>Code DLR & Latence</th>
                <th>Coût</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(x => (
                <tr key={x.id}>
                  <td className="mono">{x.tx_ref || `RAY-${1000 + x.id}`}</td>
                  <td className="mute" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(x.created_at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}
                  </td>
                  {isGlobalCPanel && (
                    <td className="cell-main">{x.tenant_name || 'Master'}</td>
                  )}
                  <td>
                    <ChannelBadge c={x.channel} />
                  </td>
                  <td>{x.operator || 'Route Directe'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    <div>De : {x.sender_addr || 'RAYONS'}</div>
                    <div className="mute">Vers : {x.addr}</div>
                  </td>
                  <td>
                    <div className="cell-main">{x.contact_name || ''}</div>
                    <div className="cell-sub">{x.body}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    <div>{x.dlr_code || 'ACCEPTD'}</div>
                    <div className="mute">{x.latency_ms ? `${x.latency_ms} ms` : '—'}</div>
                  </td>
                  <td className="mono">${Number(x.cost || 0).toFixed(4)}</td>
                  <td>
                    <StatusIndicator status={x.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
 * STUDIO D'ENVOI EN MASSE, EMAILING DIRECT & CARTES RICHES RCS (RBM)
 * Flux structuré en 3 étapes :
 *   Étape 1 : Sélectionner les Contacts / Destinataires
 *   Étape 2 : Choisir le Canal, le Template & Composer le Message (Images animées / RCS)
 *   Étape 3 : Vérifier, Planifier & Lancer la Campagne
 * ========================================================================== */
function MassCampaignsStudio({
  userEmail,
  meUsage,
  onRefreshUsage,
  onOpenEmailSettings,
  initialTemplate
}) {
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [settingsInfo, setSettingsInfo] = useState(null);

  // Étape active de l'assistant (1 = Sélection Contacts, 2 = Canal & Template, 3 = Vérification & Lancement)
  const [wizardStep, setWizardStep] = useState(1);

  // Étape 1 : Sélection des destinataires
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [opFilter, setOpFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualRecipientsText, setManualRecipientsText] = useState('');

  // Étape 2 : Canal, Template & Message
  const [campaignName, setCampaignName] = useState('');
  const [channel, setChannel] = useState('email');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('Offre Flash Entreprise — {{company}}');
  const [body, setBody] = useState(
    'Bonjour {{name}},\n\nProfitez de notre offre privilégiée réservée à nos partenaires en République Démocratique du Congo.\n\nCliquez sur le bouton ci-dessous pour activer votre avantage.'
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [metadata, setMetadata] = useState({
    badgeText: 'OFFRE FLASH ENTREPRISE',
    cardTitle: 'Jusqu’à -30% sur vos envois Télécom & Emailing',
    mediaUrl: `${API}/api/media/animated/pulse-promo.svg`,
    ctaLabel: 'Activer mon offre maintenant',
    ctaUrl: 'https://rayons.cd/offres',
    ctaPhone: '+243810000000',
    quickReplies: 'Confirmer,Être rappelé,Tarifs',
    accentColor: '#18181b',
    smsFallback: true
  });

  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);

  const loadData = useCallback(() => {
    api('/contacts')
      .then(list => {
        setContacts(list || []);
        if (!hasInitializedSelection && Array.isArray(list) && list.length > 0) {
          setSelectedContactIds(list.map(c => c.id));
          setHasInitializedSelection(true);
        }
      })
      .catch(console.error);
    api('/campaigns').then(setCampaigns).catch(console.error);
    api('/templates').then(setTemplates).catch(console.error);
    api('/settings').then(setSettingsInfo).catch(console.error);
  }, [hasInitializedSelection]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applySavedTemplate = useCallback(tpl => {
    if (!tpl) return;
    setSelectedTemplateId(String(tpl.id || ''));
    setCampaignName(`Campagne — ${tpl.name}`);
    setChannel(tpl.channel || 'email');
    setSubject(tpl.subject || tpl.name || '');
    setBody(tpl.body || '');
    setMetadata(prev => ({
      ...prev,
      ...(tpl.metadata || {})
    }));
  }, []);

  useEffect(() => {
    if (initialTemplate) {
      applySavedTemplate(initialTemplate);
    }
  }, [initialTemplate, applySavedTemplate]);

  const handleAnimatedFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = String(ev.target?.result || '');
      if (dataUrl) {
        setMetadata(prev => ({ ...prev, mediaUrl: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRecipientFileUpload = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = String(ev.target?.result || '');
      if (text) {
        setManualRecipientsText(prev => (prev ? prev + '\n' + text.trim() : text.trim()));
        setShowManualAdd(true);
      }
    };
    reader.readAsText(file);
  };

  const enrichedContacts = contacts.map(c => ({
    ...c,
    operatorLabel: detectOperatorLabel(c.phone) || 'Sans numéro'
  }));

  const operatorCounts = enrichedContacts.reduce((acc, c) => {
    acc[c.operatorLabel] = (acc[c.operatorLabel] || 0) + 1;
    return acc;
  }, {});

  const allTags = Array.from(
    new Set(enrichedContacts.flatMap(c => (Array.isArray(c.tags) ? c.tags : [])))
  );

  const filteredContacts = enrichedContacts.filter(c => {
    if (opFilter !== 'all' && c.operatorLabel !== opFilter) return false;
    if (tagFilter !== 'all' && !(Array.isArray(c.tags) && c.tags.includes(tagFilter))) return false;
    if (!contactSearch.trim()) return true;
    const qLower = contactSearch.toLowerCase();
    return (
      String(c.name || '').toLowerCase().includes(qLower) ||
      String(c.phone || '').toLowerCase().includes(qLower) ||
      String(c.email || '').toLowerCase().includes(qLower) ||
      (Array.isArray(c.tags) && c.tags.some(t => t.toLowerCase().includes(qLower)))
    );
  });

  const toggleContactSelection = id => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectFiltered = () => {
    const visibleIds = filteredContacts.map(c => c.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every(id => selectedContactIds.includes(id));
    if (allVisibleSelected) {
      setSelectedContactIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedContactIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const selectOnlyOperator = op => {
    setOpFilter(op);
    const ids = enrichedContacts
      .filter(c => op === 'all' || c.operatorLabel === op)
      .map(c => c.id);
    setSelectedContactIds(ids);
  };

  const selectOnlyTag = tag => {
    setTagFilter(tag);
    const ids = enrichedContacts
      .filter(c => tag === 'all' || (Array.isArray(c.tags) && c.tags.includes(tag)))
      .map(c => c.id);
    setSelectedContactIds(ids);
  };

  // Contacts cochés + entrées manuelles éventuelles
  const selectedContactObjects = enrichedContacts.filter(c => selectedContactIds.includes(c.id));
  const compatibleSelectedContacts = selectedContactObjects.filter(c =>
    channel === 'email' ? Boolean(c.email) : Boolean(c.phone)
  );
  const manualEntriesList = String(manualRecipientsText || '')
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const recipientCount = compatibleSelectedContacts.length + manualEntriesList.length;
  const totalRawSelectedCount = selectedContactObjects.length + manualEntriesList.length;
  const sampleRecipientName =
    compatibleSelectedContacts[0]?.name || selectedContactObjects[0]?.name || 'Amina Kabila';

  const unitPrice =
    channel === 'email' ? 0 : channel === 'rcs' ? 0.02 : channel === 'whatsapp' ? 0.008 : 0.015;
  const estimatedTotalUsd = (recipientCount * unitPrice).toFixed(3);
  const allowedChannels = meUsage?.limits?.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];

  const applyEmailPreset = type => {
    setSelectedTemplateId('');
    if (type === 'newsletter') {
      setSubject('Actualités & Nouveautés — {{company}}');
      setBody(
        'Bonjour {{name}},\n\nNous sommes ravis de vous partager nos dernières nouveautés et améliorations de service en République Démocratique du Congo.\n\nConsultez dès maintenant votre espace client pour découvrir les nouvelles fonctionnalités disponibles.'
      );
      setMetadata(prev => ({
        ...prev,
        badgeText: 'NEWSLETTER ENTREPRISE',
        cardTitle: 'Les nouveautés du mois chez {{company}}',
        mediaUrl: `${API}/api/media/animated/newsletter-wave.svg`,
        ctaLabel: 'Accéder à mon espace',
        ctaUrl: 'https://rayons.cd',
        accentColor: '#1d4ed8'
      }));
    } else if (type === 'invoice') {
      setSubject('Votre relevé mensuel — {{company}}');
      setBody(
        'Bonjour {{name}},\n\nVotre facture mensuelle est désormais disponible. Vous pouvez régler votre échéance par M-Pesa Vodacom, Airtel Money, Orange Money ou virement bancaire.\n\nNous vous remercions pour votre confiance.'
      );
      setMetadata(prev => ({
        ...prev,
        badgeText: 'FACTURATION & REÇU',
        cardTitle: 'Votre relevé mensuel est disponible',
        mediaUrl: `${API}/api/media/animated/live-payment.svg`,
        ctaLabel: 'Télécharger ma facture',
        ctaUrl: 'https://rayons.cd/factures',
        accentColor: '#15803d'
      }));
    } else if (type === 'promo') {
      setSubject('Offre Spéciale Entreprise — {{company}}');
      setBody(
        'Bonjour {{name}},\n\nProfitez de notre offre privilégiée réservée à nos clients partenaires à Kinshasa, Lubumbashi et Goma.\n\nCliquez sur le bouton ci-dessous pour activer votre avantage.'
      );
      setMetadata(prev => ({
        ...prev,
        badgeText: 'OFFRE FLASH ENTREPRISE',
        cardTitle: 'Jusqu’à -30% sur vos envois Télécom & Emailing',
        mediaUrl: `${API}/api/media/animated/pulse-promo.svg`,
        ctaLabel: 'Activer mon offre',
        ctaUrl: 'https://rayons.cd/offres',
        accentColor: '#18181b'
      }));
    } else if (type === 'vip') {
      setSubject('Invitation VIP — {{name}} ({{company}})');
      setBody(
        'Bonjour {{name}},\n\nNous avons l’honneur de vous convier à notre rencontre exécutive dédiée à la transformation digitale des entreprises en RDC.\n\nRéservez votre badge nominatif en un clic ci-dessous.'
      );
      setMetadata(prev => ({
        ...prev,
        badgeText: 'INVITATION EXCLUSIVE VIP',
        cardTitle: 'Sommet Digital & Télécom Kinshasa',
        mediaUrl: `${API}/api/media/animated/vip-event.svg`,
        ctaLabel: 'Confirmer ma présence VIP',
        ctaUrl: 'https://rayons.cd/vip',
        accentColor: '#b45309'
      }));
    }
  };

  const applyRcsPreset = type => {
    setSelectedTemplateId('');
    if (type === 'business') {
      setMetadata({
        cardTitle: 'Offre Entreprise RDC',
        mediaUrl: `${API}/api/media/animated/pulse-promo.svg`,
        ctaLabel: 'Voir les détails',
        ctaUrl: 'https://rayons.cd/offres',
        ctaPhone: '+243810000000',
        quickReplies: 'Confirmer,Être rappelé,Tarifs',
        smsFallback: true
      });
      setBody(
        'Bonjour {{name}}, découvrez notre nouvelle solution dédiée aux entreprises en RDC avec accompagnement prioritaire.'
      );
    } else if (type === 'delivery') {
      setMetadata({
        cardTitle: 'Suivi de Livraison Express',
        mediaUrl: `${API}/api/media/animated/delivery-radar.svg`,
        ctaLabel: 'Suivre mon colis',
        ctaUrl: 'https://rayons.cd/suivi',
        ctaPhone: '+243990000000',
        quickReplies: 'Je suis disponible,Reporter à demain',
        smsFallback: true
      });
      setBody(
        'Bonjour {{name}}, votre commande est en cours d’acheminement. Confirmez votre disponibilité en un clic.'
      );
    }
  };

  const launchMassCampaign = async e => {
    if (e) e.preventDefault();
    setLaunching(true);
    setLaunchResult(null);
    try {
      const out = await api('/campaigns/launch', {
        method: 'POST',
        body: {
          name: campaignName,
          channel,
          audienceMode: 'selected',
          contactIds: selectedContactIds,
          manualRecipientsText,
          subject,
          body,
          metadata,
          scheduledAt: scheduledAt || null
        }
      });
      setLaunchResult(out);
      loadData();
      if (onRefreshUsage) onRefreshUsage();
    } catch (err) {
      setLaunchResult({ error: err.message });
    } finally {
      setLaunching(false);
    }
  };

  const deleteCampaign = async id => {
    await api('/campaigns/' + id, { method: 'DELETE' });
    loadData();
  };

  const smtpInfo = settingsInfo?.smtpResolved;
  const channelTemplates = templates.filter(t => t.channel === channel);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Lancement de Campagne en Masse, Emailing Animé & Studio RCS</h2>
          <p>
            Étape 1 : Sélectionnez vos contacts destinataires • Étape 2 : Choisissez le canal & template animé • Étape 3 : Vérifiez et lancez.
          </p>
        </div>
        <div className="row">
          <button onClick={loadData}>Actualiser</button>
          {onOpenEmailSettings && (
            <button onClick={onOpenEmailSettings}>Configurer mon SMTP ({userEmail})</button>
          )}
        </div>
      </div>

      {/* BARRE DE PROGRESSION DES 3 ÉTAPES DE LA CAMPAGNE */}
      <div className="card" style={{ padding: 12, marginBottom: 18 }}>
        <div className="grid-3" style={{ gap: 10 }}>
          <button
            type="button"
            className={wizardStep === 1 ? 'primary' : ''}
            style={{
              height: 'auto',
              padding: '10px 14px',
              justifyContent: 'space-between',
              textAlign: 'left'
            }}
            onClick={() => setWizardStep(1)}
          >
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>ÉTAPE 1 SUR 3</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                1. Sélectionner les Contacts
              </div>
            </div>
            <span className="badge neutral mono">{totalRawSelectedCount} sélect.</span>
          </button>

          <button
            type="button"
            className={wizardStep === 2 ? 'primary' : ''}
            style={{
              height: 'auto',
              padding: '10px 14px',
              justifyContent: 'space-between',
              textAlign: 'left'
            }}
            onClick={() => setWizardStep(2)}
          >
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>ÉTAPE 2 SUR 3</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                2. Canal, Template & Message
              </div>
            </div>
            <ChannelBadge c={channel} />
          </button>

          <button
            type="button"
            className={wizardStep === 3 ? 'primary' : ''}
            style={{
              height: 'auto',
              padding: '10px 14px',
              justifyContent: 'space-between',
              textAlign: 'left'
            }}
            onClick={() => setWizardStep(3)}
          >
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>ÉTAPE 3 SUR 3</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                3. Vérification & Lancement
              </div>
            </div>
            <span className="badge info mono">${estimatedTotalUsd}</span>
          </button>
        </div>
      </div>

      {/* ======================================================================
       * ÉTAPE 1 : SÉLECTIONNER LES CONTACTS / DESTINATAIRES DE LA CAMPAGNE
       * ==================================================================== */}
      {wizardStep === 1 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <h3>Étape 1 : Sélectionnez les contacts destinataires de votre campagne</h3>
              <p>
                Cochez les contacts dans votre répertoire, filtrez par opérateur télécom RDC ou par segment, ou ajoutez une liste complémentaire.
              </p>
            </div>
            <div className="row">
              <span className="badge info mono" style={{ fontSize: 12.5, padding: '5px 10px' }}>
                {totalRawSelectedCount} destinataire(s) sélectionné(s)
              </span>
              <button
                type="button"
                className="primary"
                disabled={totalRawSelectedCount === 0}
                onClick={() => setWizardStep(2)}
              >
                Continuer vers l'Étape 2 : Canal & Template ({totalRawSelectedCount}) →
              </button>
            </div>
          </div>

          {initialTemplate && (
            <div className="notice info" style={{ marginBottom: 14 }}>
              Modèle pré-chargé pour l'étape suivante : <strong>{initialTemplate.name}</strong> (
              {CH[initialTemplate.channel] || initialTemplate.channel}). Sélectionnez d'abord les contacts qui recevront cette campagne.
            </div>
          )}

          {/* BARRE DE FILTRES PAR OPÉRATEUR ET PAR SEGMENT */}
          <div className="filter-bar">
            <div className="filter-chips">
              <span className="mute" style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>
                Filtrer / Cibler par Opérateur :
              </span>
              <button
                type="button"
                className={`chip ${opFilter === 'all' ? 'active' : ''}`}
                onClick={() => setOpFilter('all')}
              >
                Tous ({enrichedContacts.length})
              </button>
              {['Vodacom RDC', 'Airtel RDC', 'Orange RDC', 'Africell RDC'].map(op => (
                <button
                  key={op}
                  type="button"
                  className={`chip ${opFilter === op ? 'active' : ''}`}
                  onClick={() => selectOnlyOperator(op)}
                >
                  {op.replace(' RDC', '')} ({operatorCounts[op] || 0})
                </button>
              ))}
            </div>

            {allTags.length > 0 && (
              <div className="filter-chips">
                <span className="mute" style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>
                  Filtrer / Cibler par Segment :
                </span>
                <button
                  type="button"
                  className={`chip ${tagFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTagFilter('all')}
                >
                  Tous les segments
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className={`chip ${tagFilter === tag ? 'active' : ''}`}
                    onClick={() => selectOnlyTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* BARRE DE RECHERCHE & ACTIONS DE SÉLECTION GROUPÉE */}
          <div className="card-header" style={{ marginBottom: 12 }}>
            <input
              style={{ maxWidth: 320 }}
              placeholder="Rechercher un contact par nom, +243, email ou tag…"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
            />
            <div className="row">
              <button type="button" className="sm" onClick={toggleSelectFiltered}>
                {filteredContacts.length > 0 &&
                filteredContacts.every(c => selectedContactIds.includes(c.id))
                  ? `Désélectionner la vue (${filteredContacts.length})`
                  : `Sélectionner toute la vue (${filteredContacts.length})`}
              </button>
              <button
                type="button"
                className="sm"
                onClick={() => setSelectedContactIds(enrichedContacts.map(c => c.id))}
              >
                Tout cocher ({enrichedContacts.length})
              </button>
              {selectedContactIds.length > 0 && (
                <button
                  type="button"
                  className="sm ghost"
                  onClick={() => setSelectedContactIds([])}
                >
                  Tout décocher
                </button>
              )}
              <button
                type="button"
                className="sm"
                onClick={() => setShowManualAdd(!showManualAdd)}
              >
                {showManualAdd
                  ? 'Masquer l’ajout manuel / CSV'
                  : '+ Ajouter des numéros / emails hors répertoire'}
              </button>
            </div>
          </div>

          {/* ZONE OPTIONNELLE : COLLER UNE LISTE OU IMPORTER UN CSV EN COMPLÉMENT */}
          {showManualAdd && (
            <div className="route-block" style={{ marginBottom: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <strong>Ajouter des destinataires supplémentaires à la volée (+243 ou Emails)</strong>
                  <div className="mute" style={{ fontSize: 12 }}>
                    Ces destinataires seront automatiquement ajoutés à votre sélection et créés dans vos contacts sans doublon.
                  </div>
                </div>
                <label
                  className="sm"
                  style={{
                    cursor: 'pointer',
                    padding: '5px 10px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 6,
                    background: '#fff',
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  Charger un fichier .CSV / .TXT
                  <input
                    type="file"
                    accept=".csv,.txt"
                    style={{ display: 'none' }}
                    onChange={handleRecipientFileUpload}
                  />
                </label>
              </div>
              <textarea
                rows={3}
                className="mono"
                placeholder={'Amina Kabila : +243 81 234 5678\nmarc@horizon.cd\n+243 99 876 5432'}
                value={manualRecipientsText}
                onChange={e => setManualRecipientsText(e.target.value)}
              />
            </div>
          )}

          {/* TABLEAU INTERACTIF DE SÉLECTION DES CONTACTS */}
          {filteredContacts.length === 0 ? (
            <p className="mute" style={{ padding: '20px 0', textAlign: 'center' }}>
              Aucun contact ne correspond à ce filtre.
            </p>
          ) : (
            <div className="table-container" style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 42 }}>
                      <input
                        type="checkbox"
                        style={{ width: 16, height: 16 }}
                        checked={
                          filteredContacts.length > 0 &&
                          filteredContacts.every(c => selectedContactIds.includes(c.id))
                        }
                        onChange={toggleSelectFiltered}
                      />
                    </th>
                    <th>Nom du contact</th>
                    <th>Téléphone (+243)</th>
                    <th>Opérateur Télécom</th>
                    <th>Adresse Email</th>
                    <th>Segments / Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(c => {
                    const isChecked = selectedContactIds.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => toggleContactSelection(c.id)}
                        style={{
                          cursor: 'pointer',
                          background: isChecked ? 'var(--primary-soft)' : undefined
                        }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            style={{ width: 16, height: 16 }}
                            checked={isChecked}
                            onChange={() => toggleContactSelection(c.id)}
                          />
                        </td>
                        <td className="cell-main">{c.name}</td>
                        <td className="mono">{c.phone || '—'}</td>
                        <td>
                          <span className="badge neutral">{c.operatorLabel}</span>
                        </td>
                        <td className="mono mute">{c.email || '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            {(c.tags || []).map(t => (
                              <span key={t} className="badge info" style={{ fontSize: 10.5 }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid var(--border)'
            }}
          >
            <div className="mute" style={{ fontSize: 13 }}>
              <strong>{selectedContactObjects.length}</strong> contact(s) coché(s) dans le répertoire
              {manualEntriesList.length > 0 && (
                <span>
                  {' '}
                  + <strong>{manualEntriesList.length}</strong> destinataire(s) ajouté(s) manuellement
                </span>
              )}
            </div>
            <button
              type="button"
              className="primary"
              disabled={totalRawSelectedCount === 0}
              onClick={() => setWizardStep(2)}
            >
              Suivant : Choisir le Canal & le Template ({totalRawSelectedCount} destinataires) →
            </button>
          </div>
        </div>
      )}

      {/* ======================================================================
       * ÉTAPE 2 & ÉTAPE 3 : CANAL, TEMPLATE, MESSAGE ANIMÉ & LANCEMENT
       * ==================================================================== */}
      {wizardStep >= 2 && (
        <div className="split-view" style={{ marginBottom: 18 }}>
          {/* COLONNE GAUCHE : ÉTAPE 2 (CANAL & TEMPLATE) OU ÉTAPE 3 (CONFIRMATION & ENVOI) */}
          {wizardStep === 2 ? (
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <div>
                  <h3>Étape 2 : Choisissez le Canal, le Template & Composez votre Message</h3>
                  <p>
                    Audience sélectionnée à l'Étape 1 : <strong>{recipientCount} destinataire(s)</strong> compatibles avec {CH[channel]}.
                  </p>
                </div>
                <button type="button" className="sm" onClick={() => setWizardStep(1)}>
                  ← Modifier les contacts ({totalRawSelectedCount})
                </button>
              </div>

              <div className="channel-selector">
                {Object.entries(CH).map(([k, label]) => {
                  const isAllowed = allowedChannels.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!isAllowed}
                      className={`channel-btn ${channel === k ? 'active' : ''}`}
                      onClick={() => setChannel(k)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* GALERIE VISUELLE DE SÉLECTION DE TEMPLATE POUR CE CANAL */}
              {templates.length > 0 && (
                <div className="field">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ marginBottom: 0 }}>
                      Sélectionner un Template ({channelTemplates.length} modèle(s) {CH[channel]})
                    </label>
                    <select
                      style={{ width: 'auto', maxWidth: 280 }}
                      value={selectedTemplateId}
                      onChange={e => {
                        const found = templates.find(t => String(t.id) === String(e.target.value));
                        if (found) applySavedTemplate(found);
                      }}
                    >
                      <option value="">-- Tous les templates ({templates.length}) --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          [{CH[t.channel] || t.channel}] {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {channelTemplates.length > 0 && (
                    <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                      {channelTemplates.slice(0, 4).map(t => {
                        const isSelectedTpl = String(selectedTemplateId) === String(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applySavedTemplate(t)}
                            style={{
                              height: 'auto',
                              padding: 10,
                              textAlign: 'left',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: 4,
                              borderColor: isSelectedTpl ? 'var(--blue)' : undefined,
                              background: isSelectedTpl ? 'var(--primary-soft)' : '#fff'
                            }}
                          >
                            <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                              <strong style={{ fontSize: 12.5 }}>{t.name}</strong>
                              {t.metadata?.mediaUrl && (
                                <span className="badge info" style={{ fontSize: 10 }}>
                                  Animé
                                </span>
                              )}
                            </div>
                            <span
                              className="mute"
                              style={{
                                fontSize: 11.5,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%'
                              }}
                            >
                              {t.subject || t.body}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="field">
                <label>Nom de la campagne</label>
                <input
                  placeholder={`Ex. Diffusion ${CH[channel]} Fin de Mois`}
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                />
              </div>

              {/* CONFIGURATION SPÉCIFIQUE EMAILING EN MASSE AVEC IMAGES QUI BOUGENT */}
              {channel === 'email' && (
                <div className="route-block" style={{ marginBottom: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <strong>Emailing HTML Animé Direct : {userEmail}</strong>
                      <div className="mute" style={{ fontSize: 12 }}>
                        Serveur : {smtpInfo?.host || 'smtp.auto'}:{smtpInfo?.port || 587} ({smtpInfo?.providerLabel || 'SMTP Direct'}) • Images animées, Pixel d'ouverture & Désabonnement 1-clic
                      </div>
                    </div>
                    <div className="filter-chips">
                      <button type="button" className="chip" onClick={() => applyEmailPreset('promo')}>
                        Gabarit Offre Animée
                      </button>
                      <button type="button" className="chip" onClick={() => applyEmailPreset('invoice')}>
                        Gabarit Facture Animée
                      </button>
                      <button type="button" className="chip" onClick={() => applyEmailPreset('vip')}>
                        Gabarit VIP Animé
                      </button>
                      <button type="button" className="chip" onClick={() => applyEmailPreset('newsletter')}>
                        Gabarit Newsletter
                      </button>
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="field">
                      <label>Objet de l'email (supporte {'{{name}}'} et {'{{company}}'})</label>
                      <input
                        placeholder="Ex. Offre Flash — {{company}}"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Badge d'en-tête & Couleur de marque</label>
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          placeholder="Ex. OFFRE FLASH ENTREPRISE"
                          value={metadata.badgeText || ''}
                          onChange={e => setMetadata({ ...metadata, badgeText: e.target.value })}
                        />
                        <input
                          type="color"
                          style={{ width: 42, height: 36, padding: 2, cursor: 'pointer' }}
                          value={metadata.accentColor || '#18181b'}
                          onChange={e => setMetadata({ ...metadata, accentColor: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field">
                    <label>Grand Titre dans l'Email (Hero Headline)</label>
                    <input
                      placeholder="Ex. Jusqu'à -30% sur vos campagnes Télécom & Emailing"
                      value={metadata.cardTitle || ''}
                      onChange={e => setMetadata({ ...metadata, cardTitle: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <label style={{ marginBottom: 0 }}>
                        Choisir une Image qui bouge (Bannière Animée intégrée ou GIF)
                      </label>
                      <label
                        className="sm"
                        style={{
                          cursor: 'pointer',
                          padding: '4px 10px',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 6,
                          background: 'var(--bg-surface)',
                          fontSize: 11,
                          fontWeight: 600
                        }}
                      >
                        Importer un fichier .GIF / Image
                        <input
                          type="file"
                          accept="image/gif,image/webp,image/svg+xml,image/png,image/jpeg"
                          style={{ display: 'none' }}
                          onChange={handleAnimatedFileUpload}
                        />
                      </label>
                    </div>
                    <div className="filter-chips" style={{ marginBottom: 8 }}>
                      <button
                        type="button"
                        className={`chip ${!metadata.mediaUrl ? 'active' : ''}`}
                        onClick={() => setMetadata({ ...metadata, mediaUrl: '' })}
                      >
                        Sans image
                      </button>
                      {ANIMATED_MEDIA_GALLERY.map(anim => (
                        <button
                          key={anim.id}
                          type="button"
                          className={`chip ${metadata.mediaUrl === anim.url ? 'active' : ''}`}
                          onClick={() =>
                            setMetadata({
                              ...metadata,
                              mediaUrl: anim.url,
                              accentColor: anim.accent
                            })
                          }
                        >
                          {anim.label}
                        </button>
                      ))}
                    </div>
                    <input
                      className="mono"
                      placeholder="URL directe d'une image qui bouge (.gif, .svg, .webp) ou DataURL..."
                      value={metadata.mediaUrl || ''}
                      onChange={e => setMetadata({ ...metadata, mediaUrl: e.target.value })}
                    />
                  </div>

                  <div className="grid-2">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Bouton d'action dans l'email (CTA)</label>
                      <input
                        placeholder="Ex. Activer mon offre"
                        value={metadata.ctaLabel || ''}
                        onChange={e => setMetadata({ ...metadata, ctaLabel: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>URL du bouton CTA</label>
                      <input
                        className="mono"
                        placeholder="https://rayons.cd"
                        value={metadata.ctaUrl || ''}
                        onChange={e => setMetadata({ ...metadata, ctaUrl: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CONFIGURATION SPÉCIFIQUE CARTE RICHE RCS (RBM) */}
              {channel === 'rcs' && (
                <div className="route-block" style={{ marginBottom: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <strong>Constructeur de Carte Riche RCS (GSMA RBM / Google Jibe)</strong>
                      <div className="mute" style={{ fontSize: 12 }}>
                        Envoi enrichi avec bannière animée ou HD, boutons d'action interactifs et bascule SMS automatique.
                      </div>
                    </div>
                    <div className="filter-chips">
                      <button type="button" className="chip" onClick={() => applyRcsPreset('business')}>
                        Modèle Offre Animée
                      </button>
                      <button type="button" className="chip" onClick={() => applyRcsPreset('delivery')}>
                        Modèle Livraison Radar
                      </button>
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="field">
                      <label>Titre de la Carte Riche RCS</label>
                      <input
                        placeholder="Ex. Offre Entreprise RDC"
                        value={metadata.cardTitle || ''}
                        onChange={e => setMetadata({ ...metadata, cardTitle: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>URL de l'image / bannière animée</label>
                      <input
                        className="mono"
                        placeholder="https://..."
                        value={metadata.mediaUrl || ''}
                        onChange={e => setMetadata({ ...metadata, mediaUrl: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="filter-chips" style={{ marginBottom: 10 }}>
                    <span className="mute" style={{ fontSize: 11 }}>
                      Bannières animées RCS :
                    </span>
                    {ANIMATED_MEDIA_GALLERY.map(anim => (
                      <button
                        key={anim.id}
                        type="button"
                        className={`chip ${metadata.mediaUrl === anim.url ? 'active' : ''}`}
                        onClick={() => setMetadata({ ...metadata, mediaUrl: anim.url })}
                      >
                        {anim.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid-3">
                    <div className="field">
                      <label>Bouton Web (Libellé)</label>
                      <input
                        placeholder="Découvrir l'offre"
                        value={metadata.ctaLabel || ''}
                        onChange={e => setMetadata({ ...metadata, ctaLabel: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>URL du bouton Web</label>
                      <input
                        className="mono"
                        placeholder="https://rayons.cd"
                        value={metadata.ctaUrl || ''}
                        onChange={e => setMetadata({ ...metadata, ctaUrl: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Bouton d'appel direct (+243)</label>
                      <input
                        className="mono"
                        placeholder="+243810000000"
                        value={metadata.ctaPhone || ''}
                        onChange={e => setMetadata({ ...metadata, ctaPhone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Puces de réponses rapides (séparées par virgule)</label>
                      <input
                        placeholder="Confirmer,Être rappelé,Tarifs"
                        value={metadata.quickReplies || ''}
                        onChange={e => setMetadata({ ...metadata, quickReplies: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Repli SMS automatique (SMS Fallback)</label>
                      <select
                        value={metadata.smsFallback !== false ? 'true' : 'false'}
                        onChange={e =>
                          setMetadata({ ...metadata, smsFallback: e.target.value === 'true' })
                        }
                      >
                        <option value="true">Activé — Basculer en SMS si RCS indisponible</option>
                        <option value="false">Désactivé — RCS uniquement</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="field">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <label>
                    Contenu du message (Variables : {'{{name}}'}, {'{{company}}'}, {'{{phone}}'})
                  </label>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="sm ghost"
                      onClick={() => setBody((body ? body + ' ' : '') + '{{name}}')}
                    >
                      + {'{{name}}'}
                    </button>
                    <button
                      type="button"
                      className="sm ghost"
                      onClick={() => setBody((body ? body + ' ' : '') + '{{company}}')}
                    >
                      + {'{{company}}'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  placeholder="Rédigez le message de votre campagne…"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  required
                />
              </div>

              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)'
                }}
              >
                <button type="button" onClick={() => setWizardStep(1)}>
                  ← Étape 1 : Modifier les contacts ({totalRawSelectedCount})
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!body.trim() || recipientCount === 0}
                  onClick={() => setWizardStep(3)}
                >
                  Suivant : Étape 3 — Vérifier & Lancer ({recipientCount} dest.) →
                </button>
              </div>
            </div>
          ) : (
            /* ÉTAPE 3 : RÉCAPITULATIF COMPLET, PLANIFICATION & LANCEMENT */
            <form className="card" style={{ marginBottom: 0 }} onSubmit={launchMassCampaign}>
              <div className="card-header">
                <div>
                  <h3>Étape 3 : Vérification Finale, Planification & Lancement</h3>
                  <p>
                    Contrôlez la liste finale des destinataires sélectionnés et lancez l'expédition.
                  </p>
                </div>
                <div className="row">
                  <button type="button" className="sm" onClick={() => setWizardStep(1)}>
                    Modifier les contacts
                  </button>
                  <button type="button" className="sm" onClick={() => setWizardStep(2)}>
                    Modifier le message
                  </button>
                </div>
              </div>

              <div className="grid-3" style={{ marginBottom: 14 }}>
                <div className="quota-item">
                  <div className="quota-top">
                    <strong>Canal choisi</strong>
                    <ChannelBadge c={channel} />
                  </div>
                  <div className="mute" style={{ fontSize: 12 }}>
                    Expéditeur :{' '}
                    <strong>
                      {channel === 'email'
                        ? userEmail
                        : channel === 'rcs'
                        ? `${meUsage?.senderId || 'RAYONS_RCS'}`
                        : meUsage?.senderId || 'RAYONS'}
                    </strong>
                  </div>
                </div>

                <div className="quota-item">
                  <div className="quota-top">
                    <strong>Destinataires validés</strong>
                    <span>{recipientCount} contact(s)</span>
                  </div>
                  <div className="mute" style={{ fontSize: 12 }}>
                    {compatibleSelectedContacts.length} du répertoire
                    {manualEntriesList.length > 0 ? ` + ${manualEntriesList.length} manuels` : ''}
                  </div>
                </div>

                <div className="quota-item">
                  <div className="quota-top">
                    <strong>Coût Total Estimé</strong>
                    <span>${estimatedTotalUsd} USD</span>
                  </div>
                  <div className="mute" style={{ fontSize: 12 }}>
                    Tarif unitaire : ${unitPrice} USD / message
                  </div>
                </div>
              </div>

              {/* LISTE DES DESTINATAIRES SÉLECTIONNÉS AVEC POSSIBILITÉ DE RETIRER UN CONTACT */}
              <div className="field">
                <label>
                  Destinataires sélectionnés qui recevront cette campagne ({compatibleSelectedContacts.length})
                </label>
                <div
                  className="table-container"
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 6
                  }}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Contact</th>
                        <th>Coordonnée utilisée ({CH[channel]})</th>
                        <th>Opérateur / Route</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compatibleSelectedContacts.map(c => (
                        <tr key={c.id}>
                          <td className="cell-main">{c.name}</td>
                          <td className="mono">
                            {channel === 'email' ? c.email : c.phone}
                          </td>
                          <td>
                            <span className="badge neutral">
                              {channel === 'email' ? 'SMTP Direct' : c.operatorLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="sm ghost"
                              onClick={() => toggleContactSelection(c.id)}
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid-2" style={{ alignItems: 'end', marginTop: 14 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Planification différée (laisser vide pour un lancement immédiat)</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="primary"
                  disabled={launching || recipientCount === 0 || !body.trim()}
                >
                  {launching
                    ? 'Diffusion en cours…'
                    : scheduledAt
                    ? `Programmer la campagne (${recipientCount} dest.)`
                    : `Lancer la campagne maintenant (${recipientCount} dest. • $${estimatedTotalUsd})`}
                </button>
              </div>

              {launchResult && (
                <div
                  className={`notice ${launchResult.error ? 'err' : 'ok'}`}
                  style={{ marginTop: 14 }}
                >
                  {launchResult.error ? (
                    launchResult.error
                  ) : (
                    <div>
                      <strong>{launchResult.campaignName}</strong> —{' '}
                      {launchResult.scheduled > 0
                        ? `${launchResult.scheduled} message(s) programmé(s) dans la file d'attente.`
                        : `${launchResult.sent} message(s) expédié(s) avec succès sur ${launchResult.totalRecipients} destinataire(s) sélectionné(s).`}
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          {/* COLONNE DROITE : APERÇU EN DIRECT (RCS / EMAIL HTML ANIMÉ / SMS) */}
          <div className="card sticky-panel" style={{ marginBottom: 0 }}>
            <div className="card-header">
              <div>
                <h3>Aperçu temps réel ({sampleRecipientName})</h3>
                <p>Rendu exact reçu par vos destinataires sélectionnés.</p>
              </div>
              <span className="badge neutral mono">{recipientCount} dest.</span>
            </div>

            <div className="quota-item" style={{ marginBottom: 14 }}>
              <div className="quota-top">
                <strong>Destinataires compatibles</strong>
                <span>{recipientCount} sur {totalRawSelectedCount} sélectionné(s)</span>
              </div>
              <div className="quota-top">
                <strong>Identité d'expédition</strong>
                <span>
                  {channel === 'email'
                    ? userEmail
                    : channel === 'rcs'
                    ? `${meUsage?.senderId || 'RAYONS_RCS'} (Agent Vérifié)`
                    : meUsage?.senderId || 'RAYONS'}
                </span>
              </div>
              <div className="quota-top">
                <strong>Coût total estimé</strong>
                <span>${estimatedTotalUsd} USD (${unitPrice}/unité)</span>
              </div>
            </div>

            {channel === 'rcs' ? (
              <div className="rcs-preview-frame">
                <div className="rcs-agent-header">
                  <strong>{meUsage?.company || 'Rayons CRM'}</strong>
                  <span className="rcs-verified-pill">Agent RCS Vérifié</span>
                </div>
                <div className="rcs-card-box">
                  {metadata.mediaUrl && (
                    <img
                      className="rcs-card-media"
                      src={metadata.mediaUrl}
                      alt="Bannière RCS"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="rcs-card-content">
                    <div className="rcs-card-title">
                      {(metadata.cardTitle || 'Titre de la Carte RCS').replaceAll(
                        '{{name}}',
                        sampleRecipientName
                      )}
                    </div>
                    <div className="rcs-card-desc">
                      {(body || 'Votre message RCS enrichi apparaîtra ici…')
                        .replaceAll('{{name}}', sampleRecipientName)
                        .replaceAll('{{company}}', meUsage?.company || 'Rayons CRM')}
                    </div>
                  </div>
                  <div className="rcs-card-actions">
                    {metadata.ctaLabel && (
                      <div className="rcs-action-row">{metadata.ctaLabel}</div>
                    )}
                    {metadata.ctaPhone && (
                      <div className="rcs-action-row">Appeler {metadata.ctaPhone}</div>
                    )}
                  </div>
                </div>
                {metadata.quickReplies && (
                  <div className="rcs-quick-replies">
                    {String(metadata.quickReplies)
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map((qr, i) => (
                        <span key={i} className="rcs-reply-chip">
                          {qr}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ) : channel === 'email' ? (
              <div className="email-preview-frame">
                <div
                  className="email-preview-top"
                  style={{ background: metadata.accentColor || '#18181b' }}
                >
                  <div>
                    {metadata.badgeText && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          opacity: 0.8,
                          marginBottom: 2
                        }}
                      >
                        {metadata.badgeText}
                      </div>
                    )}
                    <strong>{meUsage?.company || 'Rayons CRM'}</strong>
                  </div>
                  <span className="mono" style={{ fontSize: 11, opacity: 0.85 }}>
                    {userEmail}
                  </span>
                </div>
                {metadata.mediaUrl && (
                  <div style={{ background: '#090d16', borderBottom: '1px solid var(--border)' }}>
                    <img
                      src={metadata.mediaUrl}
                      alt="Visuel animé Email"
                      style={{
                        width: '100%',
                        maxHeight: 190,
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                  </div>
                )}
                <div className="email-preview-body">
                  {metadata.cardTitle && (
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: '#09090b',
                        marginBottom: 6
                      }}
                    >
                      {metadata.cardTitle
                        .replaceAll('{{name}}', sampleRecipientName)
                        .replaceAll('{{company}}', meUsage?.company || 'Rayons CRM')}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13, color: '#52525b' }}>
                    Objet :{' '}
                    {(subject || '(Sans objet)')
                      .replaceAll('{{name}}', sampleRecipientName)
                      .replaceAll('{{company}}', meUsage?.company || 'Rayons CRM')}
                  </div>
                  <div style={{ whiteSpace: 'pre-line' }}>
                    {(body || 'Rédigez le contenu de votre email…')
                      .replaceAll('{{name}}', sampleRecipientName)
                      .replaceAll('{{company}}', meUsage?.company || 'Rayons CRM')}
                  </div>
                  {metadata.ctaLabel && (
                    <div>
                      <span
                        className="email-preview-cta"
                        style={{ background: metadata.accentColor || '#18181b' }}
                      >
                        {metadata.ctaLabel}
                      </span>
                    </div>
                  )}
                  <div className="email-preview-sig">
                    {settingsInfo?.settings?.emailDirect?.signature ||
                      `Envoyé par ${meUsage?.company || 'Rayons CRM'} (${userEmail}) • Lien de désabonnement 1-clic inclus`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="message-preview">
                {(body || 'Aperçu du message…')
                  .replaceAll('{{name}}', sampleRecipientName)
                  .replaceAll('{{company}}', meUsage?.company || 'Rayons CRM')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORIQUE DES CAMPAGNES D'ENVOI EN MASSE */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Historique des campagnes d'envoi en masse ({campaigns.length})</h3>
            <p>Suivi d'exécution, taux de délivrabilité et coût par campagne.</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <p className="mute">Aucune campagne en masse enregistrée pour le moment.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Nom de la campagne</th>
                  <th>Canal</th>
                  <th>Destinataires</th>
                  <th>Envoyés</th>
                  <th>Distribués / Ouverts</th>
                  <th>Échecs</th>
                  <th>Coût Total</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleString('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td>
                      <div className="cell-main">{c.name}</div>
                      <div className="cell-sub">
                        {(c.body || '').slice(0, 70)}
                        {(c.body || '').length > 70 ? '…' : ''}
                      </div>
                    </td>
                    <td>
                      <ChannelBadge c={c.channel} />
                    </td>
                    <td className="mono">{c.total_recipients}</td>
                    <td className="mono">{c.sent_count}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {c.delivered_count}
                    </td>
                    <td className="mono" style={{ color: c.failed_count > 0 ? 'var(--danger)' : undefined }}>
                      {c.failed_count}
                    </td>
                    <td className="mono">${Number(c.total_cost || 0).toFixed(3)}</td>
                    <td>
                      <StatusIndicator status={c.status === 'completed' ? 'delivered' : 'queued'} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="sm danger" onClick={() => deleteCampaign(c.id)}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================================
 * SYSTÈME DE RAPPORTS ANALYTIQUES, TECHNIQUES & FINANCIERS (C-PANEL & CLIENT)
 * ========================================================================== */
function ReportsCenter({ isGlobalCPanel = false, meUsage }) {
  const [report, setReport] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channel, setChannel] = useState('all');
  const [operator, setOperator] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      allTenants: isGlobalCPanel ? '1' : '0',
      period,
      dateFrom,
      dateTo,
      channel,
      operator,
      tenantFilter
    });
    api('/reports?' + qs.toString())
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isGlobalCPanel, period, dateFrom, dateTo, channel, operator, tenantFilter]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (!report) return <div className="card mute">Génération du rapport analytique et financier…</div>;

  const s = report.summary || {};
  const deliveryRate =
    s.outbound_tx > 0 ? Math.round((s.sent_or_delivered_tx / s.outbound_tx) * 100) : 100;
  const totalRevenue = Number(s.total_cost || 0);
  const totalBuyCost = Number(s.total_buy_cost || 0);
  const netMargin = Math.max(0, totalRevenue - totalBuyCost);

  const exportFullReportCsv = () => {
    const headers = [
      'Ref_Transaction',
      'Date_ISO',
      'Client_SaaS',
      'Contact',
      'Destinataire',
      'Expediteur',
      'Canal',
      'Operateur_Route',
      'Direction',
      'Statut',
      'Code_DLR',
      'Latence_ms',
      'Cout_Client_USD',
      ...(isGlobalCPanel ? ['Cout_Operateur_USD', 'Marge_Nette_USD'] : []),
      'Objet',
      'Message'
    ];
    const rows = (report.transactions || []).map(tx => {
      const c = Number(tx.cost || 0);
      const b = Number(tx.buy_cost || 0);
      return [
        tx.tx_ref || `RAY-${1000 + tx.id}`,
        new Date(tx.created_at).toISOString(),
        `"${(tx.tenant_name || '').replaceAll('"', '""')}"`,
        `"${(tx.contact_name || '').replaceAll('"', '""')}"`,
        tx.addr || '',
        tx.sender_addr || '',
        tx.channel,
        `"${(tx.operator || '').replaceAll('"', '""')}"`,
        tx.direction,
        tx.status,
        tx.dlr_code || '',
        tx.latency_ms || 0,
        c.toFixed(4),
        ...(isGlobalCPanel ? [b.toFixed(4), Math.max(0, c - b).toFixed(4)] : []),
        `"${(tx.subject || '').replaceAll('"', '""')}"`,
        `"${(tx.body || '').replaceAll('"', '""').replace(/\r?\n/g, ' ')}"`
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-rayons-crm-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <>
      {/* En-tête officiel visible lors de l'impression PDF */}
      <div className="print-only-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>
            RAYONS CRM — RAPPORT OFFICIEL D'EXPLOITATION & FACTURATION
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#52525b' }}>
            {isGlobalCPanel
              ? 'Console C-Panel Super-Admin (Consolidé Multi-Tenant RDC)'
              : `Compte Client : ${meUsage?.company || 'Entreprise'} (${meUsage?.user?.email || ''})`}
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div>Date d'édition : {new Date().toLocaleString('fr-FR')}</div>
          <div>Période : {period.toUpperCase()}</div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h2>
            {isGlobalCPanel
              ? 'Système de Rapports SaaS, Rentabilité Opérateurs & Audit Financier'
              : 'Rapports d’Activité, Délivrabilité & Bilan de Consommation'}
          </h2>
          <p>
            Analyse consolidée par période, par opérateur télécom RDC, par canal (SMS, RCS, Email, WhatsApp) et par campagne.
          </p>
        </div>
        <div className="row no-print">
          <button onClick={loadReport} disabled={loading}>
            {loading ? 'Calcul…' : 'Actualiser'}
          </button>
          <button onClick={() => window.print()}>Imprimer / Exporter PDF</button>
          <button className="primary" onClick={exportFullReportCsv}>
            Exporter CSV Comptable ({(report.transactions || []).length})
          </button>
        </div>
      </div>

      {/* BARRE DE FILTRES DE RAPPORT */}
      <div className="card no-print">
        <div className="grid-4">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Période d'analyse</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="today">Aujourd'hui</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="90d">90 derniers jours</option>
              <option value="all">Tout l'historique</option>
              <option value="custom">Dates personnalisées</option>
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Canal</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="all">Tous les canaux (SMS, RCS, Email, WhatsApp)</option>
              {Object.entries(CH).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Opérateur Télécom / Route</label>
            <select value={operator} onChange={e => setOperator(e.target.value)}>
              <option value="all">Tous les opérateurs RDC & Email</option>
              <option value="Vodacom">Vodacom RDC</option>
              <option value="Airtel">Airtel RDC</option>
              <option value="Orange">Orange RDC</option>
              <option value="Africell">Africell RDC</option>
              <option value="Email Direct">Email Direct (SMTP)</option>
              <option value="WhatsApp">WhatsApp Direct</option>
            </select>
          </div>

          {isGlobalCPanel ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Filtrer par Client SaaS</label>
              <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
                <option value="all">Tous les clients SaaS</option>
                {(report.byTenant || []).map(t => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.tenant_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Compte analysé</label>
              <input value={meUsage?.company || 'Mon Entreprise'} disabled />
            </div>
          )}
        </div>

        {period === 'custom' && (
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date de début</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date de fin</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* KPIS DE SYNTHÈSE DU RAPPORT */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">
            <span>Volume total traité</span>
          </div>
          <div className="metric-value">{s.total_tx || 0}</div>
          <div className="metric-foot">
            <span>Sortants : {s.outbound_tx || 0}</span>
            <span>Entrants MO : {s.inbound_tx || 0}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Taux de délivrabilité DLR</span>
          </div>
          <div className="metric-value">{deliveryRate}%</div>
          <div className="metric-foot">
            <span>Livrés : {s.delivered_tx || 0}</span>
            <span>Échecs : {s.failed_tx || 0}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Performance RCS & Emailing</span>
          </div>
          <div className="metric-value">{(s.rcs_delivered_tx || 0) + (s.email_opened_tx || 0)}</div>
          <div className="metric-foot">
            <span>RCS livrés : {s.rcs_delivered_tx || 0}</span>
            <span>Latence moy. : {s.avg_latency_ms || 36} ms</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>{isGlobalCPanel ? 'Chiffre d’Affaires & Marge SaaS' : 'Coût Total sur la période'}</span>
          </div>
          <div className="metric-value">${totalRevenue.toFixed(3)}</div>
          <div className="metric-foot">
            {isGlobalCPanel ? (
              <>
                <span>Coût opér. : ${totalBuyCost.toFixed(3)}</span>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                  Marge : +${netMargin.toFixed(3)}
                </span>
              </>
            ) : (
              <>
                <span>Programmés : {s.scheduled_tx || 0}</span>
                <span>Email : $0.000 (Direct)</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* TABLEAU 1 : PERFORMANCE DÉTAILLÉE PAR OPÉRATEUR TÉLÉCOM & ROUTE */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>1. Bilan par Opérateur Télécom RDC & Route d'expédition</h3>
            <p>Volumes, taux de livraison DLR, latence réseau et bilan financier par route.</p>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Opérateur / Route</th>
                <th>Canal</th>
                <th>Total</th>
                <th>Sortants</th>
                <th>Distribués (DLR)</th>
                <th>Entrants (MO)</th>
                <th>Échecs</th>
                <th>Taux succès</th>
                <th>Latence moy.</th>
                <th>{isGlobalCPanel ? 'Facturé Client' : 'Coût USD'}</th>
                {isGlobalCPanel && <th>Coût Opérateur</th>}
                {isGlobalCPanel && <th>Marge Nette</th>}
              </tr>
            </thead>
            <tbody>
              {(report.byOperator || []).map((row, i) => {
                const rate =
                  row.outbound > 0
                    ? Math.round(((row.outbound - row.failed) / row.outbound) * 100)
                    : 100;
                const margin = Math.max(0, Number(row.cost || 0) - Number(row.buy_cost || 0));
                return (
                  <tr key={i}>
                    <td className="cell-main">{row.operator}</td>
                    <td>
                      <ChannelBadge c={row.channel} />
                    </td>
                    <td className="mono">{row.total}</td>
                    <td className="mono">{row.outbound}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                      {row.delivered}
                    </td>
                    <td className="mono">{row.inbound}</td>
                    <td className="mono" style={{ color: row.failed > 0 ? 'var(--danger)' : undefined }}>
                      {row.failed}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <div className="progress-track" style={{ flex: 1 }}>
                          <div
                            className="progress-bar"
                            style={{
                              width: `${rate}%`,
                              background: rate >= 90 ? 'var(--green)' : 'var(--amber)'
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: 11.5 }}>{rate}%</span>
                      </div>
                    </td>
                    <td className="mono mute">{row.avg_latency_ms} ms</td>
                    <td className="mono">${Number(row.cost || 0).toFixed(4)}</td>
                    {isGlobalCPanel && (
                      <td className="mono mute">${Number(row.buy_cost || 0).toFixed(4)}</td>
                    )}
                    {isGlobalCPanel && (
                      <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                        +${margin.toFixed(4)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLEAU 2 : VENTILATION PAR CANAL & ÉVOLUTION JOURNALIÈRE */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>2. Ventilation par Canal de communication</h3>
              <p>Comparatif SMS Télécom, Cartes Riches RCS, Emailing Direct et WhatsApp.</p>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Total</th>
                  <th>Distribués</th>
                  <th>Échecs</th>
                  <th>Latence</th>
                  <th>Montant USD</th>
                </tr>
              </thead>
              <tbody>
                {(report.byChannel || []).map(ch => (
                  <tr key={ch.channel}>
                    <td>
                      <ChannelBadge c={ch.channel} />
                    </td>
                    <td className="mono">{ch.total}</td>
                    <td className="mono">{ch.delivered}</td>
                    <td className="mono">{ch.failed}</td>
                    <td className="mono mute">{ch.avg_latency_ms} ms</td>
                    <td className="mono">${Number(ch.cost || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <h3>3. Évolution journalière des flux</h3>
              <p>Historique quotidien consolidé par canal et coût.</p>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total</th>
                  <th>SMS</th>
                  <th>RCS</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Coût USD</th>
                </tr>
              </thead>
              <tbody>
                {(report.byDay || []).map(d => (
                  <tr key={d.day}>
                    <td className="mono cell-main">{d.day}</td>
                    <td className="mono">{d.total}</td>
                    <td className="mono">{d.sms_n}</td>
                    <td className="mono">{d.rcs_n}</td>
                    <td className="mono">{d.email_n}</td>
                    <td className="mono">{d.whatsapp_n}</td>
                    <td className="mono">${Number(d.cost || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TABLEAU 3 (SI C-PANEL) : CLASSEMENT PAR CLIENT SAAS */}
      {isGlobalCPanel && (report.byTenant || []).length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>4. Rapport de consommation et rentabilité par Client SaaS</h3>
              <p>Répartition des envois SMS, RCS, WhatsApp, Email et marge nette générée par entreprise.</p>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Client SaaS</th>
                  <th>Sender ID</th>
                  <th>Forfait</th>
                  <th>SMS</th>
                  <th>RCS</th>
                  <th>WhatsApp</th>
                  <th>Emails</th>
                  <th>Facturé Client</th>
                  <th>Coût Opérateur</th>
                  <th>Marge SaaS</th>
                </tr>
              </thead>
              <tbody>
                {(report.byTenant || []).map(t => {
                  const m = Math.max(0, Number(t.revenue_usd || 0) - Number(t.buy_cost_usd || 0));
                  return (
                    <tr key={t.tenant_id}>
                      <td className="cell-main">{t.tenant_name}</td>
                      <td className="mono">{t.sender_id}</td>
                      <td style={{ textTransform: 'capitalize' }}>{t.plan}</td>
                      <td className="mono">{t.sms_tx}</td>
                      <td className="mono">{t.rcs_tx}</td>
                      <td className="mono">{t.whatsapp_tx}</td>
                      <td className="mono">{t.email_tx}</td>
                      <td className="mono">${Number(t.revenue_usd || 0).toFixed(3)}</td>
                      <td className="mono mute">${Number(t.buy_cost_usd || 0).toFixed(3)}</td>
                      <td className="mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                        +${m.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================================
 * BOÎTE DE RÉCEPTION UNIFIÉE (CONVERSATIONS 2-WAY) & AUTO-RÉPONDEUR MOTS-CLÉS
 * ========================================================================== */
function UnifiedInboxAndAutoResponder({ userEmail, meUsage, onRefreshUsage }) {
  const [section, setSection] = useState('inbox'); // 'inbox' | 'autoreply'
  const [threads, setThreads] = useState([]);
  const [activeContactId, setActiveContactId] = useState(null);
  const [threadDetail, setThreadDetail] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [rules, setRules] = useState([]);

  // Filtres Boîte de réception
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'unread' | 'sms' | 'rcs' | 'whatsapp' | 'email'

  // Compositeur de réponse directe
  const [replyChannel, setReplyChannel] = useState('sms');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyMeta, setReplyMeta] = useState({
    cardTitle: '',
    mediaUrl: '',
    ctaLabel: '',
    ctaUrl: ''
  });
  const [sendingReply, setSendingReply] = useState(false);
  const [replyStatusMsg, setReplyStatusMsg] = useState(null);

  // Simulateur de message entrant 2-Way
  const [showSimulator, setShowSimulator] = useState(false);
  const [simContactId, setSimContactId] = useState('');
  const [simChannel, setSimChannel] = useState('sms');
  const [simBody, setSimBody] = useState('Bonjour, pouvez-vous m’envoyer vos TARIFS entreprise ?');
  const [simulating, setSimulating] = useState(false);
  const [simFeedback, setSimFeedback] = useState(null);

  // Formulaire Auto-répondeur
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    keyword: '',
    match_type: 'contains',
    channel: 'all',
    reply_channel: 'same',
    reply_subject: '',
    reply_body: '',
    add_tag: '',
    reply_metadata: { mediaUrl: '', ctaLabel: '', ctaUrl: '' },
    is_active: true
  });
  const [ruleNotice, setRuleNotice] = useState(null);

  const loadInboxAndRules = useCallback(async () => {
    try {
      const [thr, rls, tpls] = await Promise.all([
        api('/inbox/threads'),
        api('/auto-replies'),
        api('/templates')
      ]);
      setThreads(thr || []);
      setRules(rls || []);
      setTemplates(tpls || []);
      if (!activeContactId && thr && thr.length > 0) {
        setActiveContactId(thr[0].contact_id);
      }
      if (!simContactId && thr && thr.length > 0) {
        setSimContactId(String(thr[0].contact_id));
      }
    } catch (e) {
      console.error(e);
    }
  }, [activeContactId, simContactId]);

  const loadActiveThread = useCallback(async contactId => {
    if (!contactId) return;
    try {
      const data = await api(`/inbox/threads/${contactId}`);
      setThreadDetail(data);
      const msgs = data?.messages || [];
      if (msgs.length > 0) {
        const lastCh = msgs[msgs.length - 1].channel;
        if (lastCh) setReplyChannel(lastCh);
      }
      // Rafraîchir la liste des fils pour mettre à jour le compteur non-lu
      api('/inbox/threads').then(setThreads).catch(() => {});
      if (onRefreshUsage) onRefreshUsage();
    } catch (e) {
      console.error(e);
    }
  }, [onRefreshUsage]);

  useEffect(() => {
    loadInboxAndRules();
  }, [loadInboxAndRules]);

  useEffect(() => {
    if (activeContactId) {
      loadActiveThread(activeContactId);
    }
  }, [activeContactId, loadActiveThread]);

  const totalUnread = threads.reduce((acc, t) => acc + Number(t.unread_count || 0), 0);
  const allowedChannels = meUsage?.limits?.allowedChannels || ['sms', 'whatsapp', 'rcs', 'email'];

  const filteredThreads = threads.filter(t => {
    if (channelFilter === 'unread' && Number(t.unread_count || 0) === 0) return false;
    if (
      ['sms', 'rcs', 'whatsapp', 'email'].includes(channelFilter) &&
      t.last_channel !== channelFilter
    ) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const qLower = searchQuery.toLowerCase();
    return (
      String(t.name || '').toLowerCase().includes(qLower) ||
      String(t.phone || '').toLowerCase().includes(qLower) ||
      String(t.email || '').toLowerCase().includes(qLower) ||
      String(t.last_body || '').toLowerCase().includes(qLower)
    );
  });

  const handleSendReply = async e => {
    e.preventDefault();
    if (!activeContactId || !replyBody.trim()) return;
    setSendingReply(true);
    setReplyStatusMsg(null);
    try {
      const out = await api(`/inbox/threads/${activeContactId}/reply`, {
        method: 'POST',
        body: {
          channel: replyChannel,
          subject: replySubject,
          body: replyBody,
          metadata: replyMeta
        }
      });
      if (out.ok === false) {
        setReplyStatusMsg({ error: out.error || 'Échec de l’envoi' });
      } else {
        setReplyBody('');
        setReplyStatusMsg({ ok: `Réponse transmise (${out.txRef}) via ${out.operator || replyChannel.toUpperCase()}` });
        await loadActiveThread(activeContactId);
      }
    } catch (err) {
      setReplyStatusMsg({ error: err.message });
    } finally {
      setSendingReply(false);
    }
  };

  const handleSimulateInbound = async e => {
    e.preventDefault();
    if (!simBody.trim()) return;
    setSimulating(true);
    setSimFeedback(null);
    try {
      const out = await api('/inbox/simulate-inbound', {
        method: 'POST',
        body: {
          contactId: simContactId ? +simContactId : undefined,
          channel: simChannel,
          body: simBody
        }
      });
      setSimFeedback(out);
      if (out.contact_id) {
        setActiveContactId(out.contact_id);
        await loadActiveThread(out.contact_id);
      }
      await loadInboxAndRules();
    } catch (err) {
      setSimFeedback({ error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm({
      name: '',
      keyword: '',
      match_type: 'contains',
      channel: 'all',
      reply_channel: 'same',
      reply_subject: '',
      reply_body: '',
      add_tag: '',
      reply_metadata: { mediaUrl: '', ctaLabel: '', ctaUrl: '' },
      is_active: true
    });
  };

  const saveRule = async e => {
    e.preventDefault();
    setRuleNotice(null);
    try {
      if (editingRuleId) {
        await api(`/auto-replies/${editingRuleId}`, {
          method: 'PUT',
          body: ruleForm
        });
        setRuleNotice({ ok: 'Règle d’auto-répondeur mise à jour.' });
      } else {
        await api('/auto-replies', {
          method: 'POST',
          body: ruleForm
        });
        setRuleNotice({ ok: 'Nouvelle règle d’auto-répondeur activée.' });
      }
      resetRuleForm();
      loadInboxAndRules();
      if (onRefreshUsage) onRefreshUsage();
    } catch (err) {
      setRuleNotice({ error: err.message });
    }
  };

  const editRule = r => {
    setEditingRuleId(r.id);
    setRuleForm({
      name: r.name || '',
      keyword: r.keyword || '',
      match_type: r.match_type || 'contains',
      channel: r.channel || 'all',
      reply_channel: r.reply_channel || 'same',
      reply_subject: r.reply_subject || '',
      reply_body: r.reply_body || '',
      add_tag: r.add_tag || '',
      reply_metadata: r.reply_metadata || { mediaUrl: '', ctaLabel: '', ctaUrl: '' },
      is_active: r.is_active !== false
    });
    setSection('autoreply');
  };

  const toggleRule = async id => {
    await api(`/auto-replies/${id}/toggle`, { method: 'POST' });
    loadInboxAndRules();
    if (onRefreshUsage) onRefreshUsage();
  };

  const deleteRule = async id => {
    await api(`/auto-replies/${id}`, { method: 'DELETE' });
    loadInboxAndRules();
    if (onRefreshUsage) onRefreshUsage();
  };

  const activeContact = threadDetail?.contact;
  const threadMessages = threadDetail?.messages || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Boîte de Réception Unifiée (2-Way) & Auto-Répondeur</h2>
          <p>
            Gérez vos conversations bidirectionnelles SMS (+243), Cartes Riches RCS, WhatsApp et Emailing avec réponses automatiques par mots-clés.
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className={section === 'inbox' ? 'primary' : ''}
            onClick={() => setSection('inbox')}
          >
            Conversations 2-Way ({threads.length}){totalUnread > 0 ? ` • ${totalUnread} non lu(s)` : ''}
          </button>
          <button
            type="button"
            className={section === 'autoreply' ? 'primary' : ''}
            onClick={() => setSection('autoreply')}
          >
            Auto-Répondeur Mots-Clés ({rules.filter(r => r.is_active).length} actifs)
          </button>
          <button
            type="button"
            onClick={() => setShowSimulator(!showSimulator)}
          >
            {showSimulator ? 'Fermer le simulateur 2-Way' : 'Tester un message entrant (2-Way)'}
          </button>
        </div>
      </div>

      {/* BANDEAU DE SIMULATION DE RÉPONSE CLIENT ENTRANTE (POUR TESTER LE 2-WAY & L'AUTO-RÉPONDEUR) */}
      {showSimulator && (
        <form className="card" onSubmit={handleSimulateInbound}>
          <div className="card-header">
            <div>
              <h3>Simulateur de message client entrant (Test 2-Way & Auto-Répondeur)</h3>
              <p>
                Simulez la réception d'un SMS, d'une réponse rapide RCS ou d'un message WhatsApp envoyé par un client pour tester vos règles automatiques en temps réel.
              </p>
            </div>
            <span className="badge info">Webhook MO Temps Réel</span>
          </div>

          <div className="grid-3">
            <div className="field">
              <label>Contact expéditeur</label>
              <select value={simContactId} onChange={e => setSimContactId(e.target.value)}>
                {threads.map(t => (
                  <option key={t.contact_id} value={t.contact_id}>
                    {t.name} ({t.phone || t.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Canal utilisé par le client</label>
              <select value={simChannel} onChange={e => setSimChannel(e.target.value)}>
                <option value="sms">SMS Télécom (+243)</option>
                <option value="rcs">Réponse Carte Riche RCS (RBM)</option>
                <option value="whatsapp">WhatsApp Direct</option>
                <option value="email">Email Entrant</option>
              </select>
            </div>
            <div className="field">
              <label>Scénarios rapides de test (Mots-clés)</label>
              <div className="filter-chips" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    setSimBody('Bonjour, pouvez-vous m’envoyer vos TARIFS entreprise ?')
                  }
                >
                  Mot-clé TARIFS
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setSimBody('CONFIRMER — Je valide ma commande')}
                >
                  Mot-clé CONFIRMER
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setSimBody('Être rappelé cet après-midi svp')}
                >
                  Mot-clé RAPPEL
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setSimBody('INFO')}
                >
                  Mot-clé INFO
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setSimBody('STOP')}
                >
                  Mot-clé STOP
                </button>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ alignItems: 'end' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Texte envoyé par le client</label>
              <input
                value={simBody}
                onChange={e => setSimBody(e.target.value)}
                placeholder="Ex. Bonjour, quels sont vos TARIFS ?"
              />
            </div>
            <button type="submit" className="primary" disabled={simulating}>
              {simulating ? 'Réception en cours…' : 'Simuler la réception du message client'}
            </button>
          </div>

          {simFeedback && (
            <div
              className={`notice ${simFeedback.error ? 'err' : 'ok'}`}
              style={{ marginTop: 12 }}
            >
              {simFeedback.error ? (
                simFeedback.error
              ) : (
                <div>
                  <strong>Message entrant reçu ({simFeedback.tx_ref})</strong> de{' '}
                  <strong>{simFeedback.contact_name}</strong>.
                  {simFeedback.optOut && (
                    <span> • Le contact a envoyé STOP et a été ajouté à la liste noire.</span>
                  )}
                  {simFeedback.autoReplyTriggered && (
                    <span>
                      {' '}
                      • <strong>Auto-Répondeur déclenché :</strong> règle{' '}
                      <em>« {simFeedback.autoReplyRuleName} »</em> exécutée automatiquement
                      {simFeedback.autoReplyTagAdded
                        ? ` (Tag « ${simFeedback.autoReplyTagAdded} » ajouté au contact)`
                        : ''}
                      !
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {section === 'inbox' ? (
        /* ====================================================================
         * VUE 1 : CONVERSATIONS BIDIRECTIONNELLES (2-WAY INBOX)
         * ================================================================== */
        <div className="inbox-grid">
          {/* COLONNE GAUCHE : LISTE DES CONVERSATIONS */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
            <div style={{ padding: 14 }}>
              <input
                placeholder="Rechercher un contact, +243 ou message…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <div className="filter-chips">
                {[
                  { k: 'all', l: `Tous (${threads.length})` },
                  { k: 'unread', l: `Non lus (${totalUnread})` },
                  { k: 'sms', l: 'SMS' },
                  { k: 'rcs', l: 'RCS' },
                  { k: 'whatsapp', l: 'WhatsApp' },
                  { k: 'email', l: 'Email' }
                ].map(f => (
                  <button
                    key={f.k}
                    type="button"
                    className={`chip ${channelFilter === f.k ? 'active' : ''}`}
                    onClick={() => setChannelFilter(f.k)}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="thread-list">
              {filteredThreads.length === 0 ? (
                <div className="mute" style={{ padding: 20, textAlign: 'center' }}>
                  Aucune conversation trouvée.
                </div>
              ) : (
                filteredThreads.map(t => {
                  const isActive = Number(activeContactId) === Number(t.contact_id);
                  const isUnread = Number(t.unread_count || 0) > 0;
                  return (
                    <button
                      key={t.contact_id}
                      type="button"
                      className={`thread-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
                      onClick={() => setActiveContactId(t.contact_id)}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <strong style={{ fontSize: 13.5, color: 'var(--text)' }}>{t.name}</strong>
                        <div className="row" style={{ gap: 6 }}>
                          {t.last_channel && <ChannelBadge c={t.last_channel} />}
                          {isUnread && <span className="unread-pill">{t.unread_count}</span>}
                        </div>
                      </div>

                      <div className="row" style={{ justifyContent: 'space-between', width: '100%', fontSize: 11.5 }}>
                        <span className="mono mute">{t.phone || t.email}</span>
                        <span className="mute">{t.operatorLabel?.replace(' RDC', '')}</span>
                      </div>

                      <div
                        className="mute"
                        style={{
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          fontWeight: isUnread ? 600 : 400,
                          color: isUnread ? 'var(--text)' : 'var(--text-muted)'
                        }}
                      >
                        {t.last_body
                          ? `${t.last_direction === 'in' ? 'Client : ' : 'Vous : '}${t.last_body}`
                          : 'Aucun message échangé — Cliquez pour démarrer'}
                      </div>

                      {Array.isArray(t.tags) && t.tags.length > 0 && (
                        <div className="row" style={{ gap: 4, marginTop: 2 }}>
                          {t.tags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              className="badge neutral"
                              style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* COLONNE DROITE : FIL DE DISCUSSION CHRONOLOGIQUE & RÉPONSE DIRECTE */}
          <div className="card" style={{ marginBottom: 0 }}>
            {!activeContact ? (
              <div className="mute" style={{ padding: 40, textAlign: 'center' }}>
                Sélectionnez un contact dans la colonne de gauche pour ouvrir la conversation.
              </div>
            ) : (
              <>
                <div className="card-header" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <h3>{activeContact.name}</h3>
                      <span className="badge info">{activeContact.operatorLabel}</span>
                    </div>
                    <p className="mono" style={{ marginTop: 4 }}>
                      {activeContact.phone || 'Sans numéro'}{' '}
                      {activeContact.email ? `• ${activeContact.email}` : ''}
                    </p>
                  </div>
                  <div className="row">
                    {Array.isArray(activeContact.tags) &&
                      activeContact.tags.map(tag => (
                        <span key={tag} className="badge neutral">
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>

                {/* FLUX DES MESSAGES ENTRANTS ET SORTANTS */}
                <div className="chat-stream">
                  {threadMessages.length === 0 ? (
                    <div className="mute" style={{ margin: 'auto', textAlign: 'center' }}>
                      Aucun message dans cette conversation. Envoyez un message ci-dessous pour démarrer.
                    </div>
                  ) : (
                    threadMessages.map(msg => {
                      const isInbound = msg.direction === 'in';
                      const meta = msg.metadata || {};
                      return (
                        <div
                          key={msg.id}
                          className={`chat-bubble-row ${isInbound ? 'inbound' : 'outbound'}`}
                        >
                          <div className="chat-bubble">
                            {meta.isAutoReply && (
                              <div className="autoreply-tag">
                                Auto-Répondeur : {meta.autoReplyRuleName || 'Scénario automatique'}
                              </div>
                            )}
                            {meta.mediaUrl && (
                              <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden' }}>
                                <img
                                  src={meta.mediaUrl}
                                  alt="Média du message"
                                  style={{
                                    width: '100%',
                                    maxHeight: 150,
                                    objectFit: 'cover',
                                    display: 'block'
                                  }}
                                />
                              </div>
                            )}
                            {(meta.cardTitle || msg.subject) && (
                              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13.5 }}>
                                {meta.cardTitle || msg.subject}
                              </div>
                            )}
                            <div style={{ whiteSpace: 'pre-line' }}>{msg.body}</div>
                            {meta.ctaLabel && (
                              <div style={{ marginTop: 8 }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '5px 11px',
                                    borderRadius: 5,
                                    background: isInbound ? 'var(--primary)' : '#ffffff',
                                    color: isInbound ? '#ffffff' : '#18181b',
                                    fontSize: 11.5,
                                    fontWeight: 600
                                  }}
                                >
                                  {meta.ctaLabel}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="chat-meta">
                            <ChannelBadge c={msg.channel} />
                            <span>{msg.operator || ''}</span>
                            {msg.dlr_code && <span className="mono">{msg.dlr_code}</span>}
                            <span>
                              {new Date(msg.created_at).toLocaleString('fr-FR', {
                                dateStyle: 'short',
                                timeStyle: 'short'
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* COMPOSITEUR DE RÉPONSE MULTICANAL */}
                <form onSubmit={handleSendReply}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <div className="channel-selector" style={{ marginBottom: 0 }}>
                      {Object.entries(CH).map(([k, label]) => {
                        const isAllowed = allowedChannels.includes(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            disabled={!isAllowed}
                            className={`channel-btn ${replyChannel === k ? 'active' : ''}`}
                            onClick={() => setReplyChannel(k)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {templates.length > 0 && (
                      <select
                        style={{ width: 'auto', maxWidth: 260 }}
                        defaultValue=""
                        onChange={e => {
                          const tpl = templates.find(t => String(t.id) === String(e.target.value));
                          if (tpl) {
                            setReplyChannel(tpl.channel || replyChannel);
                            setReplySubject(tpl.subject || tpl.name || '');
                            setReplyBody(tpl.body || '');
                            setReplyMeta({
                              cardTitle: tpl.metadata?.cardTitle || '',
                              mediaUrl: tpl.metadata?.mediaUrl || '',
                              ctaLabel: tpl.metadata?.ctaLabel || '',
                              ctaUrl: tpl.metadata?.ctaUrl || ''
                            });
                          }
                        }}
                      >
                        <option value="">Insérer un Template (Email Animé / RCS / SMS)…</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>
                            [{CH[t.channel] || t.channel}] {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {(replyChannel === 'email' || replyChannel === 'rcs') && (
                    <div className="grid-2" style={{ marginBottom: 10 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>
                          {replyChannel === 'email' ? 'Objet de l’email' : 'Titre de la Carte RCS'}
                        </label>
                        <input
                          placeholder={
                            replyChannel === 'email'
                              ? 'Objet de votre réponse…'
                              : 'Titre de la Carte Riche RCS…'
                          }
                          value={replyChannel === 'email' ? replySubject : replyMeta.cardTitle}
                          onChange={e =>
                            replyChannel === 'email'
                              ? setReplySubject(e.target.value)
                              : setReplyMeta({ ...replyMeta, cardTitle: e.target.value })
                          }
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Bannière Animée / Image (optionnel)</label>
                        <select
                          value={replyMeta.mediaUrl || ''}
                          onChange={e => setReplyMeta({ ...replyMeta, mediaUrl: e.target.value })}
                        >
                          <option value="">Sans bannière animée</option>
                          {ANIMATED_MEDIA_GALLERY.map(anim => (
                            <option key={anim.id} value={anim.url}>
                              {anim.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="field" style={{ marginBottom: 10 }}>
                    <textarea
                      rows={3}
                      placeholder={`Répondre à ${activeContact.name} par ${CH[replyChannel]} (supporte {{name}}, {{company}})…`}
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      required
                    />
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="sm ghost"
                        onClick={() => setReplyBody((replyBody ? replyBody + ' ' : '') + '{{name}}')}
                      >
                        + {'{{name}}'}
                      </button>
                      <button
                        type="button"
                        className="sm ghost"
                        onClick={() => setReplyBody((replyBody ? replyBody + ' ' : '') + '{{company}}')}
                      >
                        + {'{{company}}'}
                      </button>
                    </div>
                    <button
                      type="submit"
                      className="primary"
                      disabled={sendingReply || !replyBody.trim()}
                    >
                      {sendingReply
                        ? 'Envoi en cours…'
                        : `Envoyer la réponse (${CH[replyChannel]})`}
                    </button>
                  </div>

                  {replyStatusMsg && (
                    <div
                      className={`notice ${replyStatusMsg.error ? 'err' : 'ok'}`}
                      style={{ marginTop: 10 }}
                    >
                      {replyStatusMsg.error || replyStatusMsg.ok}
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ====================================================================
         * VUE 2 : AUTO-RÉPONDEUR PAR MOTS-CLÉS (SCÉNARIOS AUTOMATIQUES)
         * ================================================================== */
        <div className="split-view">
          <form className="card" style={{ marginBottom: 0 }} onSubmit={saveRule}>
            <div className="card-header">
              <div>
                <h3>
                  {editingRuleId
                    ? 'Modifier la règle d’Auto-Répondeur'
                    : 'Créer une règle d’Auto-Répondeur par Mot-Clé'}
                </h3>
                <p>
                  Déclenchez automatiquement une réponse SMS, RCS, WhatsApp ou Email Animé et segmentez le contact dès qu’un client vous écrit.
                </p>
              </div>
              {editingRuleId && (
                <button type="button" className="sm ghost" onClick={resetRuleForm}>
                  Nouvelle règle
                </button>
              )}
            </div>

            {ruleNotice && (
              <div
                className={`notice ${ruleNotice.error ? 'err' : 'ok'}`}
                style={{ marginBottom: 14 }}
              >
                {ruleNotice.error || ruleNotice.ok}
              </div>
            )}

            <div className="grid-2">
              <div className="field">
                <label>Nom du scénario automatique</label>
                <input
                  placeholder="Ex. Demande de Grille Tarifaire B2B"
                  value={ruleForm.name}
                  onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Type de détection</label>
                <select
                  value={ruleForm.match_type}
                  onChange={e => setRuleForm({ ...ruleForm, match_type: e.target.value })}
                >
                  <option value="contains">Contient l'un des mots-clés (Recommandé)</option>
                  <option value="exact">Correspondance exacte du mot-clé</option>
                  <option value="starts_with">Commence par le mot-clé</option>
                  <option value="any">Tous les messages entrants (Accueil général)</option>
                </select>
              </div>
            </div>

            {ruleForm.match_type !== 'any' && (
              <div className="field">
                <label>
                  Mots-clés déclencheurs (séparés par une virgule — insensible aux majuscules/accents)
                </label>
                <input
                  className="mono"
                  placeholder="Ex. TARIFS, PRIX, DEVIS, COUT"
                  value={ruleForm.keyword}
                  onChange={e => setRuleForm({ ...ruleForm, keyword: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="grid-3">
              <div className="field">
                <label>Canal entrant écouté</label>
                <select
                  value={ruleForm.channel}
                  onChange={e => setRuleForm({ ...ruleForm, channel: e.target.value })}
                >
                  <option value="all">Tous les canaux (SMS, RCS, WhatsApp, Email)</option>
                  <option value="sms">SMS Télécom uniquement</option>
                  <option value="rcs">RCS uniquement</option>
                  <option value="whatsapp">WhatsApp uniquement</option>
                  <option value="email">Email uniquement</option>
                </select>
              </div>
              <div className="field">
                <label>Canal de réponse automatique</label>
                <select
                  value={ruleForm.reply_channel}
                  onChange={e => setRuleForm({ ...ruleForm, reply_channel: e.target.value })}
                >
                  <option value="same">Même canal que le client (Recommandé)</option>
                  <option value="sms">Forcer SMS Télécom</option>
                  <option value="rcs">Forcer Carte Riche RCS</option>
                  <option value="whatsapp">Forcer WhatsApp</option>
                  <option value="email">Forcer Email Direct</option>
                </select>
              </div>
              <div className="field">
                <label>Tag automatique ajouté au contact</label>
                <input
                  placeholder="Ex. Prospect Chaud, Confirmé..."
                  value={ruleForm.add_tag}
                  onChange={e => setRuleForm({ ...ruleForm, add_tag: e.target.value })}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Objet / Titre de la réponse (si Email ou RCS)</label>
                <input
                  placeholder="Ex. Votre grille tarifaire — {{company}}"
                  value={ruleForm.reply_subject}
                  onChange={e => setRuleForm({ ...ruleForm, reply_subject: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Visuel animé joint (si réponse par Email ou RCS)</label>
                <select
                  value={ruleForm.reply_metadata?.mediaUrl || ''}
                  onChange={e =>
                    setRuleForm({
                      ...ruleForm,
                      reply_metadata: { ...ruleForm.reply_metadata, mediaUrl: e.target.value }
                    })
                  }
                >
                  <option value="">Aucun visuel animé</option>
                  {ANIMATED_MEDIA_GALLERY.map(anim => (
                    <option key={anim.id} value={anim.url}>
                      {anim.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>
                Message de réponse automatique (Variables : {'{{name}}'}, {'{{company}}'}, {'{{phone}}'})
              </label>
              <textarea
                rows={4}
                placeholder="Bonjour {{name}}, merci d'avoir contacté {{company}}..."
                value={ruleForm.reply_body}
                onChange={e => setRuleForm({ ...ruleForm, reply_body: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="primary" style={{ width: '100%' }}>
              {editingRuleId
                ? 'Enregistrer les modifications de la règle'
                : 'Activer cette règle d’Auto-Répondeur'}
            </button>
          </form>

          {/* LISTE DES RÈGLES D'AUTO-RÉPONDEUR CONFIGURÉES */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header">
              <div>
                <h3>Règles d'Auto-Répondeur actives ({rules.length})</h3>
                <p>Ordre de priorité d'évaluation lors de la réception d'un message entrant.</p>
              </div>
            </div>

            {rules.length === 0 ? (
              <p className="mute">Aucune règle configurée.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rules.map(r => (
                  <div key={r.id} className="route-block">
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <strong>{r.name}</strong>
                        <span className={`badge ${r.is_active ? 'ok' : 'neutral'}`}>
                          {r.is_active ? 'Actif' : 'En pause'}
                        </span>
                        {r.add_tag && (
                          <span className="badge info">+ Tag : {r.add_tag}</span>
                        )}
                      </div>
                      <span className="mono mute" style={{ fontSize: 11.5 }}>
                        {r.trigger_count || 0} déclenchement(s)
                      </span>
                    </div>

                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <span className="mute">Mots-clés : </span>
                      <strong className="mono" style={{ color: 'var(--primary)' }}>
                        {r.match_type === 'any' ? 'Tous les messages (*)' : r.keyword}
                      </strong>
                      <span className="mute">
                        {' '}
                        • Canal écouté : {r.channel === 'all' ? 'Tous' : CH[r.channel] || r.channel}
                      </span>
                    </div>

                    <div
                      className="message-preview"
                      style={{ marginBottom: 10, padding: '8px 10px', fontSize: 12.5 }}
                    >
                      {r.reply_body}
                    </div>

                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        type="button"
                        className="sm"
                        onClick={() => toggleRule(r.id)}
                      >
                        {r.is_active ? 'Mettre en pause' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="sm"
                        onClick={() => editRule(r)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="sm danger"
                        onClick={() => deleteRule(r.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================================
 * APPLICATION PRINCIPALE : SÉPARATION STRICTE C-PANEL vs ESPACE CLIENT
 * ========================================================================== */
export default function App() {
  const [auth, setAuth] = useState(!!localStorage.token);
  const [portalMode, setPortalMode] = useState(
    localStorage.portalMode || (localStorage.userRole === 'superadmin' ? 'cpanel' : 'client')
  );
  const [cpanelTab, setCpanelTab] = useState('cpanel-dash');
  const [clientTab, setClientTab] = useState('client-dash');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [meUsage, setMeUsage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadUsage = useCallback(() => {
    if (!localStorage.token) return;
    api('/me/usage')
      .then(info => {
        setMeUsage(info);
        if (info?.user?.email) localStorage.userEmail = info.user.email;
        if (info?.user?.role) localStorage.userRole = info.user.role;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (auth) loadUsage();
  }, [auth, loadUsage]);

  const setPortal = mode => {
    localStorage.portalMode = mode;
    setPortalMode(mode);
    setDrawerOpen(false);
  };

  // Connexion directe du Super-Admin dans l'Espace Client d'une entreprise depuis le C-Panel
  const handleOpenClientWorkspace = async tenantId => {
    try {
      if (!localStorage.adminTokenBackup) {
        localStorage.adminTokenBackup = localStorage.token;
      }
      const res = await api(`/admin/impersonate/${tenantId}`, { method: 'POST' });
      localStorage.token = res.token;
      localStorage.userEmail = res.email;
      setPortal('client');
      setClientTab('client-dash');
      loadUsage();
    } catch (e) {
      alert(e.message);
    }
  };

  // Retour en 1 clic à la Console C-Panel Super-Admin
  const handleReturnToCPanel = () => {
    if (localStorage.adminTokenBackup) {
      localStorage.token = localStorage.adminTokenBackup;
      localStorage.removeItem('adminTokenBackup');
    }
    localStorage.userRole = 'superadmin';
    setPortal('cpanel');
    setCpanelTab('cpanel-clients');
    loadUsage();
  };

  if (!auth) {
    return (
      <Login
        onDone={initialPortal => {
          setPortal(initialPortal || 'client');
          setAuth(true);
        }}
      />
    );
  }

  const role = meUsage?.user?.role || localStorage.userRole || 'client';
  const isSuperAdmin = role === 'superadmin';
  const hasAdminBackup = !!localStorage.adminTokenBackup;
  const userEmail = meUsage?.user?.email || localStorage.userEmail || 'admin@rayons.cd';
  const tenantName = meUsage?.company || 'Rayons CRM';

  // Si l'utilisateur est en mode C-Panel et est bien Super-Admin -> Afficher la PARTIE 1 : C-PANEL
  const showCPanel = isSuperAdmin && portalMode === 'cpanel' && !hasAdminBackup;

  const cpanelNav = [
    { key: 'cpanel-dash', label: 'Supervision SaaS', short: 'SaaS', icon: 'dash' },
    { key: 'cpanel-clients', label: 'Clients et quotas', short: 'Clients', icon: 'clients' },
    { key: 'cpanel-billing', label: 'Crédits et facturation', short: 'Crédits', icon: 'billing' },
    { key: 'cpanel-routes', label: 'Routes télécoms maîtresses', short: 'Routes', icon: 'routes' },
    { key: 'cpanel-reports', label: 'Rapports et analytique', short: 'Rapports', icon: 'reports' },
    { key: 'cpanel-tx', label: 'Audit des transactions', short: 'Audit', icon: 'transactions' }
  ];

  const clientNav = [
    { key: 'client-dash', label: 'Tableau de bord', short: 'Accueil', icon: 'dash' },
    {
      key: 'client-inbox',
      label: 'Boîte de réception 2-Way',
      short: 'Réception',
      icon: 'inbox',
      badge: meUsage?.unreadInboxCount || 0
    },
    { key: 'client-contacts', label: 'Contacts et envois', short: 'Contacts', icon: 'contacts' },
    { key: 'client-mass', label: 'Envoi en masse et RCS', short: 'Masse/RCS', icon: 'mass' },
    { key: 'client-templates', label: 'Modèles de messages', short: 'Modèles', icon: 'templates' },
    { key: 'client-reports', label: 'Rapports et bilan', short: 'Rapports', icon: 'reports' },
    { key: 'client-tx', label: 'Mes transactions', short: 'Journal', icon: 'transactions' },
    { key: 'client-account', label: 'Mon email et clé API', short: 'Compte', icon: 'settings' }
  ];

  const activeNavList = showCPanel ? cpanelNav : clientNav;
  const currentTabKey = showCPanel ? cpanelTab : clientTab;
  const selectTab = key => {
    if (showCPanel) setCpanelTab(key);
    else setClientTab(key);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Bannière supérieure quand le Super-Admin inspecte la Partie Client */}
      {(hasAdminBackup || (isSuperAdmin && !showCPanel)) && (
        <div className="impersonation-bar">
          <div>
            <strong>PARTIE 2 : ESPACE CLIENT</strong> — Vous consultez l'espace CRM de{' '}
            <strong>{tenantName}</strong> ({userEmail})
          </div>
          <button type="button" onClick={handleReturnToCPanel}>
            Retourner à la Partie 1 (Console C-Panel)
          </button>
        </div>
      )}

      {/* Barre supérieure mobile */}
      <header className="mobile-topbar">
        <div className="brand-lockup">
          <div className="brand-mark-box">R</div>
          <span>{showCPanel ? 'Rayons C-Panel' : tenantName}</span>
        </div>
        <div className="row">
          <span className="role-tag">{showCPanel ? 'C-PANEL ADMIN' : 'ESPACE CLIENT'}</span>
          <button
            type="button"
            className="sm ghost"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Menu"
          >
            <Icon name={drawerOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <div className="app-shell">
        <aside className={`sidebar ${showCPanel ? 'cpanel-theme' : ''} ${drawerOpen ? 'open' : ''}`}>
          <div>
            <div className="sidebar-header">
              <div className="brand-lockup">
                <div className="brand-mark-box">R</div>
                <span>{showCPanel ? 'Rayons C-Panel' : 'Rayons CRM'}</span>
              </div>
              <span className="role-tag">
                {showCPanel ? 'ADMIN SAAS' : 'CLIENT'}
              </span>
            </div>

            <nav className="nav-menu">
              {activeNavList.map(item => (
                <button
                  key={item.key}
                  className={`nav-btn ${currentTabKey === item.key ? 'active' : ''}`}
                  onClick={() => selectTab(item.key)}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span className="row" style={{ gap: 9 }}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && <span className="unread-pill">{item.badge}</span>}
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-footer">
            {isSuperAdmin && showCPanel && (
              <button
                type="button"
                className="sm primary"
                style={{ width: '100%' }}
                onClick={() => setPortal('client')}
              >
                Basculer vers Partie Client
              </button>
            )}
            {(hasAdminBackup || (isSuperAdmin && !showCPanel)) && (
              <button
                type="button"
                className="sm primary"
                style={{ width: '100%' }}
                onClick={handleReturnToCPanel}
              >
                Retourner au C-Panel
              </button>
            )}

            <div className="account-summary">
              <div className="avatar">{initials(userEmail)}</div>
              <div className="account-details">
                <strong>{userEmail}</strong>
                <span>
                  {showCPanel
                    ? 'Console C-Panel'
                    : `${tenantName} • Forfait ${meUsage?.plan || 'Standard'}`}
                </span>
              </div>
            </div>
            <button
              className="sm"
              style={{ width: '100%' }}
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('userRole');
                localStorage.removeItem('adminTokenBackup');
                setMeUsage(null);
                setAuth(false);
              }}
            >
              Se déconnecter
            </button>
          </div>
        </aside>

        <main className="workspace">
          {showCPanel ? (
            /* ---------- RENDU PARTIE 1 : CONSOLE C-PANEL ---------- */
            <>
              {cpanelTab === 'cpanel-dash' && <CPanelDashboard onNavigate={selectTab} />}
              {cpanelTab === 'cpanel-clients' && (
                <AdminClientsPanel onOpenClientWorkspace={handleOpenClientWorkspace} />
              )}
              {cpanelTab === 'cpanel-billing' && <CPanelBilling />}
              {cpanelTab === 'cpanel-routes' && <CPanelRoutes />}
              {cpanelTab === 'cpanel-reports' && <ReportsCenter isGlobalCPanel={true} meUsage={meUsage} />}
              {cpanelTab === 'cpanel-tx' && <TransactionsStats isGlobalCPanel={true} />}
            </>
          ) : (
            /* ---------- RENDU PARTIE 2 : ESPACE CLIENT CRM ---------- */
            <>
              {clientTab === 'client-dash' && (
                <ClientDashboard onNavigate={selectTab} meUsage={meUsage} />
              )}
              {clientTab === 'client-inbox' && (
                <UnifiedInboxAndAutoResponder
                  userEmail={userEmail}
                  meUsage={meUsage}
                  onRefreshUsage={loadUsage}
                />
              )}
              {clientTab === 'client-contacts' && (
                <Contacts
                  userEmail={userEmail}
                  meUsage={meUsage}
                  onRefreshUsage={loadUsage}
                  initialTemplate={selectedTemplate}
                />
              )}
              {clientTab === 'client-mass' && (
                <MassCampaignsStudio
                  userEmail={userEmail}
                  meUsage={meUsage}
                  onRefreshUsage={loadUsage}
                  onOpenEmailSettings={() => selectTab('client-account')}
                  initialTemplate={selectedTemplate}
                />
              )}
              {clientTab === 'client-templates' && (
                <ClientTemplates
                  onUseTemplate={tpl => {
                    setSelectedTemplate(tpl);
                    selectTab('client-contacts');
                  }}
                  onUseTemplateInMass={tpl => {
                    setSelectedTemplate(tpl);
                    selectTab('client-mass');
                  }}
                />
              )}
              {clientTab === 'client-reports' && (
                <ReportsCenter isGlobalCPanel={false} meUsage={meUsage} />
              )}
              {clientTab === 'client-tx' && <TransactionsStats isGlobalCPanel={false} />}
              {clientTab === 'client-account' && (
                <ClientAccountSettings meUsage={meUsage} onRefreshUsage={loadUsage} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Barre de navigation inférieure mobile */}
      <nav className="mobile-bottomnav">
        {activeNavList.map(item => (
          <button
            key={item.key}
            className={currentTabKey === item.key ? 'active' : ''}
            onClick={() => selectTab(item.key)}
          >
            <Icon name={item.icon} />
            <span>{item.short}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
