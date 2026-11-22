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
      Authorization: 'Bearer ' + (localStorage.cpanel_token || '')
    },
    body: body && JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && localStorage.cpanel_token) {
    localStorage.removeItem('cpanel_token');
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
 * CONNEXION C-PANEL (UNIQUEMENT LE FORMULAIRE DE CONNEXION)
 * ========================================================================== */
function CPanelLogin({ onDone }) {
  const [step, setStep] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async e => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const r = await api('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password }
      });
      if (r.role !== 'superadmin') {
        throw new Error('Accès réservé aux administrateurs C-Panel.');
      }
      localStorage.cpanel_token = r.token;
      localStorage.cpanel_email = r.email || email.trim();
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async e => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const r = await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim(), portal: 'cpanel' }
      });
      setInfo(r.message);
      setResetCode('');
      setNewPassword('');
      setStep('reset');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async e => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      const r = await api('/auth/reset-password', {
        method: 'POST',
        body: { email: email.trim(), code: resetCode.trim(), newPassword }
      });
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setInfo(r.message);
      setStep('login');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-centered">
      <div className="auth-box">
        <div className="auth-brand-center">
          <div className="brand-mark-box">R</div>
          <span>Rayons C-Panel</span>
        </div>

        {info && (
          <div role="status" className="auth-notice" style={{ marginTop: 18 }}>
            {info}
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={submitLogin} style={{ marginTop: 22 }}>
            <div className="field">
              <label htmlFor="cpanel-email">Adresse email</label>
              <input
                id="cpanel-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="admin@entreprise.cd"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="cpanel-password">Mot de passe</label>
              <div className="pwd-field">
                <input
                  id="cpanel-password"
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  aria-pressed={showPwd}
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div className="auth-actions-row">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setErr('');
                  setInfo('');
                  setStep('forgot');
                }}
              >
                Mot de passe oublié ?
              </button>
            </div>

            {err && (
              <div role="alert" className="err-text" style={{ fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <button type="submit" className="primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        {step === 'forgot' && (
          <form onSubmit={submitForgot} style={{ marginTop: 22 }}>
            <div className="field">
              <label htmlFor="cpanel-forgot-email">Adresse email du compte</label>
              <p id="cpanel-forgot-hint" className="field-hint">
                Un code de réinitialisation à 6 chiffres sera envoyé à cette adresse.
              </p>
              <input
                id="cpanel-forgot-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="done"
                aria-describedby="cpanel-forgot-hint"
                placeholder="admin@entreprise.cd"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            {err && (
              <div role="alert" className="err-text" style={{ fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <button type="submit" className="primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Envoi…' : 'Envoyer le code'}
            </button>

            <div className="auth-footer-links">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setErr('');
                  setInfo('');
                  setStep('login');
                }}
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={submitReset} style={{ marginTop: 22 }}>
            <div className="field">
              <label htmlFor="cpanel-reset-email">Adresse email</label>
              <input
                id="cpanel-reset-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="cpanel-reset-code">Code de vérification</label>
              <p id="cpanel-otp-hint" className="field-hint">
                Saisissez le code à 6 chiffres reçu par email.
              </p>
              <input
                id="cpanel-reset-code"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                enterKeyHint="next"
                aria-describedby="cpanel-otp-hint"
                className="otp-input"
                placeholder="000000"
                value={resetCode}
                onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="cpanel-new-password">Nouveau mot de passe</label>
              <div className="pwd-field">
                <input
                  id="cpanel-new-password"
                  name="new-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  enterKeyHint="done"
                  placeholder="8 caractères minimum"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  aria-pressed={showPwd}
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            {err && (
              <div role="alert" className="err-text" style={{ fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <button type="submit" className="primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Mise à jour…' : 'Réinitialiser le mot de passe'}
            </button>

            <div className="auth-footer-links">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setErr('');
                  setInfo('');
                  setStep('forgot');
                }}
              >
                Renvoyer un code
              </button>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setErr('');
                  setInfo('');
                  setStep('login');
                }}
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
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
 * APPLICATION C-PANEL (ADMINISTRATION SAAS UNIQUEMENT)
 * ========================================================================== */
export default function App() {
  const [auth, setAuth] = useState(!!localStorage.cpanel_token);
  const [tab, setTab] = useState('cpanel-dash');
  const [meUsage, setMeUsage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadUsage = useCallback(() => {
    if (!localStorage.cpanel_token) return;
    api('/me/usage')
      .then(info => {
        if (info?.user?.role && info.user.role !== 'superadmin') {
          localStorage.removeItem('cpanel_token');
          setAuth(false);
          return;
        }
        setMeUsage(info);
        if (info?.user?.email) localStorage.cpanel_email = info.user.email;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (auth) loadUsage();
  }, [auth, loadUsage]);

  const handleOpenClientWorkspace = async tenantId => {
    try {
      const res = await api(`/admin/impersonate/${tenantId}`, { method: 'POST' });
      const clientOrigin =
        import.meta.env.VITE_CLIENT_URL ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:5173'
          : window.location.origin);
      window.open(
        `${clientOrigin}/#impersonate=${encodeURIComponent(res.token)}`,
        '_blank',
        'noopener'
      );
    } catch (e) {
      alert(e.message);
    }
  };

  if (!auth) {
    return <CPanelLogin onDone={() => setAuth(true)} />;
  }

  const userEmail = meUsage?.user?.email || localStorage.cpanel_email || '';

  const navItems = [
    { key: 'cpanel-dash', label: 'Supervision SaaS', short: 'SaaS', icon: 'dash' },
    { key: 'cpanel-clients', label: 'Clients et quotas', short: 'Clients', icon: 'clients' },
    { key: 'cpanel-billing', label: 'Crédits et facturation', short: 'Crédits', icon: 'billing' },
    { key: 'cpanel-routes', label: 'Routes télécoms maîtresses', short: 'Routes', icon: 'routes' },
    { key: 'cpanel-reports', label: 'Rapports et analytique', short: 'Rapports', icon: 'reports' },
    { key: 'cpanel-tx', label: 'Audit des transactions', short: 'Audit', icon: 'transactions' }
  ];

  const selectTab = key => {
    setTab(key);
    setDrawerOpen(false);
  };

  return (
    <>
      <header className="mobile-topbar">
        <div className="brand-lockup">
          <div className="brand-mark-box">R</div>
          <span>Rayons C-Panel</span>
        </div>
        <div className="row">
          <span className="role-tag">C-PANEL ADMIN</span>
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

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <div className="app-shell">
        <aside className={`sidebar cpanel-theme ${drawerOpen ? 'open' : ''}`}>
          <div>
            <div className="sidebar-header">
              <div className="brand-lockup">
                <div className="brand-mark-box">R</div>
                <span>Rayons C-Panel</span>
              </div>
              <span className="role-tag">ADMIN SAAS</span>
            </div>

            <nav className="nav-menu">
              {navItems.map(item => (
                <button
                  key={item.key}
                  className={`nav-btn ${tab === item.key ? 'active' : ''}`}
                  onClick={() => selectTab(item.key)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-footer">
            <div className="account-summary">
              <div className="avatar">{initials(userEmail)}</div>
              <div className="account-details">
                <strong>{userEmail}</strong>
                <span>Console C-Panel</span>
              </div>
            </div>
            <button
              className="sm"
              style={{ width: '100%' }}
              onClick={() => {
                localStorage.removeItem('cpanel_token');
                localStorage.removeItem('cpanel_email');
                setMeUsage(null);
                setAuth(false);
              }}
            >
              Se déconnecter
            </button>
          </div>
        </aside>

        <main className="workspace">
          {tab === 'cpanel-dash' && <CPanelDashboard onNavigate={selectTab} />}
          {tab === 'cpanel-clients' && (
            <AdminClientsPanel onOpenClientWorkspace={handleOpenClientWorkspace} />
          )}
          {tab === 'cpanel-billing' && <CPanelBilling />}
          {tab === 'cpanel-routes' && <CPanelRoutes />}
          {tab === 'cpanel-reports' && <ReportsCenter isGlobalCPanel={true} meUsage={meUsage} />}
          {tab === 'cpanel-tx' && <TransactionsStats isGlobalCPanel={true} />}
        </main>
      </div>

      <nav className="mobile-bottomnav">
        {navItems.map(item => (
          <button
            key={item.key}
            className={tab === item.key ? 'active' : ''}
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
