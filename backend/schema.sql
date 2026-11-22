CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'business',
  status TEXT NOT NULL DEFAULT 'active',
  sender_id TEXT NOT NULL DEFAULT 'RAYONS',
  client_id TEXT UNIQUE,
  api_key TEXT UNIQUE,
  api_secret_hash TEXT,
  limits JSONB NOT NULL DEFAULT '{}',
  channel_flags JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT, email TEXT, tags TEXT[] DEFAULT '{}', notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
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
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email','rcs','whatsapp')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  addr TEXT, sender_addr TEXT, operator TEXT, tx_ref TEXT,
  cost NUMERIC(10,4) DEFAULT 0,
  buy_cost NUMERIC(10,4) DEFAULT 0,
  dlr_code TEXT,
  delivered_at TIMESTAMPTZ,
  latency_ms INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  subject TEXT, body TEXT, status TEXT DEFAULT 'queued',
  metadata JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT true,
  provider_id TEXT, error TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_contact_created ON messages(tenant_id, contact_id, created_at);
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
);
CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email','rcs','whatsapp')),
  subject TEXT, body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_logs (
  id SERIAL PRIMARY KEY, tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'M-Pesa Vodacom',
  reference TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
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
);
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  addr TEXT NOT NULL,
  reason TEXT DEFAULT 'STOP SMS',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, addr)
);
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
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  ip_addr TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email, created_at);
CREATE TABLE IF NOT EXISTS accounting_entries (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'all',
  quantity INT NOT NULL DEFAULT 0,
  amount_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  buy_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  margin_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  payment_method TEXT,
  reference TEXT,
  note TEXT,
  actor_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounting_tenant_created ON accounting_entries(tenant_id, created_at);
