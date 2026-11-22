import fs from 'node:fs';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const FIRESTORE_TABLES = [
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
  'audit_logs',
  'password_resets'
];

const WRITE_SQL_REGEX = /^\s*(INSERT|UPDATE|DELETE)\b/i;

let firestoreInstance = null;

export function getFirestoreDb() {
  if (firestoreInstance) return firestoreInstance;

  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'crm-rayons';
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountJson) {
      initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
        projectId
      });
    } else if (credPath && fs.existsSync(credPath)) {
      initializeApp({
        credential: cert(JSON.parse(fs.readFileSync(credPath, 'utf8'))),
        projectId
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId
      });
    }
  }

  firestoreInstance = getFirestore();
  return firestoreInstance;
}

function serializeValueForFirestore(val) {
  if (val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(serializeValueForFirestore);
  if (val !== null && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) out[k] = serializeValueForFirestore(v);
    }
    return out;
  }
  return val;
}

function formatSqlValue(val, udtName) {
  if (val === null || val === undefined) return null;
  if (udtName === 'jsonb' || udtName === 'json') {
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  return val;
}

export async function hydratePGliteFromFirestore(pgliteDb) {
  const fsDb = getFirestoreDb();
  const snapshots = new Map();
  let totalDocs = 0;

  for (const table of FIRESTORE_TABLES) {
    const colsRes = await pgliteDb.query(
      `SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table]
    );
    const colTypes = Object.fromEntries(colsRes.rows.map(r => [r.column_name, r.udt_name]));
    const allowedCols = new Set(Object.keys(colTypes));

    const snap = await fsDb.collection(table).get();
    const idMap = new Map();

    const docs = snap.docs
      .map(d => ({ docId: d.id, data: d.data() }))
      .sort((a, b) => Number(a.data?.id ?? a.docId) - Number(b.data?.id ?? b.docId));

    for (const { docId, data } of docs) {
      const cols = Object.keys(data).filter(c => allowedCols.has(c));
      if (cols.length === 0) continue;
      const colNames = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const values = cols.map(c => formatSqlValue(data[c], colTypes[c]));
      await pgliteDb.query(
        `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values
      );
      idMap.set(String(data.id ?? docId), JSON.stringify(serializeValueForFirestore(data)));
      totalDocs++;
    }

    await pgliteDb.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`
    );
    snapshots.set(table, idMap);
  }

  return { snapshots, totalDocs };
}

export function detectTouchedTables(sqlText) {
  if (!WRITE_SQL_REGEX.test(sqlText)) return [];
  const lower = sqlText.toLowerCase();
  const touched = [];
  for (const table of FIRESTORE_TABLES) {
    const re = new RegExp(`\\b(?:into|update|from)\\s+(?:public\\.)?"?${table}"?\\b`, 'i');
    if (re.test(lower)) touched.push(table);
  }
  return touched;
}

export async function syncTablesToFirestore(pgliteDb, snapshots, tables) {
  if (!tables || tables.length === 0) return;
  const fsDb = getFirestoreDb();

  for (const table of tables) {
    const prevMap = snapshots.get(table) || new Map();
    const { rows } = await pgliteDb.query(`SELECT * FROM ${table} ORDER BY id ASC`);
    const nextMap = new Map();
    const ops = [];

    for (const row of rows) {
      const idKey = String(row.id);
      const serialized = serializeValueForFirestore(row);
      const digest = JSON.stringify(serialized);
      nextMap.set(idKey, digest);
      if (prevMap.get(idKey) !== digest) {
        ops.push({ type: 'set', ref: fsDb.collection(table).doc(idKey), data: serialized });
      }
    }

    for (const oldId of prevMap.keys()) {
      if (!nextMap.has(oldId)) {
        ops.push({ type: 'delete', ref: fsDb.collection(table).doc(oldId) });
      }
    }

    // Firestore batch limit is 500 operations
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fsDb.batch();
      for (const op of ops.slice(i, i + 400)) {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else batch.delete(op.ref);
      }
      await batch.commit();
    }

    snapshots.set(table, nextMap);
  }
}

export async function syncAllTablesToFirestore(pgliteDb, snapshots) {
  return syncTablesToFirestore(pgliteDb, snapshots, FIRESTORE_TABLES);
}
