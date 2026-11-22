import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const dataDir = path.join(backendDir, '.pgdata');
const schemaPath = path.join(backendDir, 'schema.sql');
const outputSqlPath = path.join(backendDir, 'supabase_migration.sql');

const TABLES_IN_ORDER = [
  'tenants',
  'users',
  'contacts',
  'campaigns',
  'messages',
  'templates',
  'auto_reply_rules',
  'credit_logs',
  'recharge_requests',
  'blacklist',
  'webhook_logs',
  'audit_logs'
];

function escapeSqlLiteral(val, colType) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (val instanceof Date) return `'${val.toISOString()}'::timestamptz`;
  if (colType === 'jsonb' || colType === 'json') {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    return `'${str.replace(/'/g, "''")}'::jsonb`;
  }
  if (Array.isArray(val)) {
    const items = val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
    return `ARRAY[${items}]::text[]`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function readLocalData() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Base locale introuvable dans ${dataDir}`);
  }
  const db = new PGlite(dataDir);
  const dump = {};
  const colTypes = {};

  for (const table of TABLES_IN_ORDER) {
    const existsRes = await db.query(`SELECT to_regclass('public.${table}') AS t`);
    if (!existsRes.rows[0]?.t) {
      dump[table] = [];
      colTypes[table] = {};
      continue;
    }
    const colsRes = await db.query(
      `SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    colTypes[table] = Object.fromEntries(colsRes.rows.map(r => [r.column_name, r.udt_name]));
    const rowsRes = await db.query(`SELECT * FROM ${table} ORDER BY id ASC`);
    dump[table] = rowsRes.rows;
  }

  await db.close();
  return { dump, colTypes };
}

function buildMigrationSql(schemaSql, dump, colTypes) {
  const lines = [
    '-- ============================================================================',
    '-- Rayons CRM — Migration complète (Schéma + Données locales) vers Supabase',
    `-- Généré le ${new Date().toISOString()}`,
    '-- ============================================================================',
    '',
    'BEGIN;',
    '',
    schemaSql.trim(),
    ''
  ];

  for (const table of TABLES_IN_ORDER) {
    const rows = dump[table] || [];
    if (rows.length === 0) continue;
    lines.push(`-- Table: ${table} (${rows.length} lignes)`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const colList = cols.map(c => `"${c}"`).join(', ');
      const valList = cols.map(c => escapeSqlLiteral(row[c], colTypes[table]?.[c])).join(', ');
      lines.push(`INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;`);
    }
    lines.push(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}));`
    );
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n') + '\n';
}

async function pushToSupabase(connectionString, sql) {
  let cleanUrl = connectionString.trim();
  try {
    const parsed = new URL(cleanUrl);
    parsed.searchParams.delete('sslmode');
    cleanUrl = parsed.toString();
  } catch {
    // keep raw string
  }

  const client = new pg.Client({
    connectionString: cleanUrl,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const pushFlagIndex = args.indexOf('--push');
  const isPush = pushFlagIndex !== -1;

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const { dump, colTypes } = await readLocalData();
  const migrationSql = buildMigrationSql(schemaSql, dump, colTypes);

  const summary = TABLES_IN_ORDER.map(t => `${t}: ${(dump[t] || []).length}`).join(', ');
  fs.writeFileSync(outputSqlPath, migrationSql, 'utf8');
  console.log(`Export SQL généré : ${outputSqlPath}`);
  console.log(`Données locales lues -> ${summary}`);

  if (isPush) {
    const argUrl = args[pushFlagIndex + 1] && !args[pushFlagIndex + 1].startsWith('--')
      ? args[pushFlagIndex + 1]
      : '';
    const targetUrl = argUrl || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || '';
    const isLocal = !targetUrl || /^postgres(ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1)(:|\/|$)/i.test(targetUrl);
    if (isLocal) {
      console.error(
        'Aucune URL Supabase détectée. Passez la chaîne de connexion en argument :\n' +
        '  npm run supabase:push -- "postgresql://postgres.<REF>:<MOT_DE_PASSE>@aws-0-<REGION>.pooler.supabase.com:5432/postgres"'
      );
      process.exit(1);
    }
    console.log('Envoi du schéma et des données vers Supabase...');
    await pushToSupabase(targetUrl, migrationSql);
    console.log('Migration vers Supabase terminée avec succès !');
  }
}

main().catch(err => {
  console.error('Erreur migration Supabase :', err.message);
  process.exit(1);
});
