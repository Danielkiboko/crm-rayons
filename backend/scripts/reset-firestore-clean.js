import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { FIRESTORE_TABLES, getFirestoreDb } from '../src/firestoreSync.js';
import { DEFAULT_TELECOM_SETTINGS, PLAN_PRESETS, generateApiKey } from '../src/db.js';

const ALL_COLLECTIONS = [...FIRESTORE_TABLES, '_rayons_meta'];

async function clearCollection(db, name) {
  const snap = await db.collection(name).get();
  if (snap.empty) return 0;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 400)) {
      batch.delete(doc.ref);
      deleted++;
    }
    await batch.commit();
  }
  return deleted;
}

async function main() {
  const fsDb = getFirestoreDb();
  const adminEmail = (process.env.ADMIN_EMAIL || 'danielkiboko218@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const now = new Date().toISOString();

  let totalDeleted = 0;
  for (const col of ALL_COLLECTIONS) {
    const n = await clearCollection(fsDb, col);
    totalDeleted += n;
  }
  console.log(`Nettoyage terminé : ${totalDeleted} documents de démo supprimés de Firestore.`);

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await fsDb.collection('tenants').doc('1').set({
    id: 1,
    name: 'Rayons CRM',
    plan: 'enterprise',
    status: 'active',
    sender_id: 'RAYONS',
    api_key: generateApiKey(),
    limits: PLAN_PRESETS.enterprise,
    settings: DEFAULT_TELECOM_SETTINGS,
    created_at: now
  });

  await fsDb.collection('users').doc('1').set({
    id: 1,
    tenant_id: 1,
    email: adminEmail,
    password_hash: passwordHash,
    role: 'superadmin',
    created_at: now
  });

  console.log(`Base Firestore prête et vierge ! Seul le compte administrateur (${adminEmail}) a été conservé.`);
}

main().catch(err => {
  console.error('Erreur nettoyage Firestore :', err.message);
  process.exit(1);
});
