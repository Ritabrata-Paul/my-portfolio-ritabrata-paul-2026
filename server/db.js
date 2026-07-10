// MongoDB Atlas connection. Builds the SRV URI from separate env vars so the
// password (which may contain '@', ':', etc.) is safely URL-encoded.

import { MongoClient } from 'mongodb';

let client;
let db;

export function isConfigured() {
  return Boolean(
    process.env.MONGODB_USER &&
    process.env.MONGODB_PASS &&
    process.env.MONGODB_CLUSTER &&
    !process.env.MONGODB_CLUSTER.startsWith('REPLACE_')
  );
}

export function buildUri() {
  const user = encodeURIComponent(process.env.MONGODB_USER);
  const pass = encodeURIComponent(process.env.MONGODB_PASS);
  const cluster = process.env.MONGODB_CLUSTER;
  const dbName = process.env.MONGODB_DB || 'portfolio';
  return `mongodb+srv://${user}:${pass}@${cluster}/${dbName}?retryWrites=true&w=majority`;
}

export async function getDb() {
  if (db) return db;
  if (!isConfigured()) {
    throw new Error('MongoDB not configured — set MONGODB_USER/PASS/CLUSTER in .env');
  }
  client = new MongoClient(buildUri());
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'portfolio');
  return db;
}

export async function closeDb() {
  if (client) await client.close();
  client = undefined;
  db = undefined;
}
