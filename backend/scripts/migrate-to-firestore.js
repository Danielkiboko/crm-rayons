import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { FIRESTORE_TABLES, getFirestoreDb } from '../src/firestoreSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const dataDir = path.join(backendDir, '.pgdata');

function serialize(val) {
  if (val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(serialize);
  if (val !== null && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) out[k] = serialize(v);
    }
    return out;
  }
  return val;
}

async function main() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Base locale PGlite introuvable dans ${dataDir}`);
  }

  const localDb = new PGlite(dataDir);
  const fsDb = getFirestoreDb();
  const counts = {};

  try {
    for (const table of FIRESTORE_TABLES) {
      const exists = await localDb.query(`SELECT to_regclass('public.${table}') AS t`);
      if (!exists.rows[0]?.t) {
        counts[table] = 0;
        continue;
      }

      const { rows } = await localDb.query(`SELECT * FROM ${table} ORDER BY id ASC`);
      counts[table] = rows.length;

      for (let i = 0; i < rows.length; i += 400) {
        const batch = fsDb.batch();
        for (const row of rows.slice(i, i + 400)) {
          const docRef = fsDb.collection(table).doc(String(row.id));
          batch.set(docRef, serialize(row));
        }
        await batch.commit();
      }
      console.log(`Collection Firestore '${table}' synchronisée (${rows.length} documents)`);
    }

    await fsDb.collection('_rayons_meta').doc('migration').set({
      migratedAt: new Date().toISOString(),
      source: 'pglite-local',
      counts
    });

    console.log('Migration complète vers Cloud Firestore réussie !', counts);
  } finally {
    await localDb.close();
  }
}

main().catch(err => {
  console.error('Erreur migration Firestore :', err.message);
  process.exit(1);
});
