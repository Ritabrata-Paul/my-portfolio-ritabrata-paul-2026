// Quick MongoDB connectivity check.  Run: npm run test:db
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, isConfigured, closeDb } from './db.js';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

if (!isConfigured()) {
  console.error('❌ MongoDB not configured — check MONGODB_USER/PASS/CLUSTER in .env');
  process.exit(1);
}

try {
  const db = await getDb();
  const ping = await db.command({ ping: 1 });
  console.log('✅ Connected to Atlas:', process.env.MONGODB_CLUSTER, '| ping:', ping.ok === 1 ? 'ok' : ping);
  const count = await db.collection('applications').countDocuments();
  console.log(`✅ "applications" collection reachable — ${count} record(s).`);
  await closeDb();
  process.exit(0);
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  console.error('   Common cause: your IP is not whitelisted. Atlas → Network Access → Add IP (0.0.0.0/0 to allow all).');
  process.exit(1);
}
