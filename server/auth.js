// Email + password login for the private dashboard. No email/SMTP involved —
// Render's free tier blocks outbound SMTP, which made OTP logins hang forever.
// Uses Node's built-in crypto (no bcrypt/jwt deps). Auth data lives in the
// MongoDB collections: sessions, loginEvents.

import crypto from 'node:crypto';
import { getDb } from './db.js';

const SESSION_TTL = () => (Number(process.env.SESSION_TTL_HOURS || 12)) * 60 * 60 * 1000;

// ── Password ──────────────────────────────────────────────
export function verifyPassword(password) {
  const stored = process.env.ADMIN_PASSWORD_HASH || '';
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  // timing-safe compare
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function emailMatches(email) {
  return (email || '').trim().toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
}

// ── Login: email + password → session token (no email/OTP) ──
export async function login(email, password) {
  if (!emailMatches(email)) return { ok: false, error: 'Invalid email or password' };
  if (!verifyPassword(password)) return { ok: false, error: 'Invalid email or password' };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL());
  const db = await getDb();
  await db.collection('sessions').insertOne({ token, email: email.toLowerCase(), expiresAt, createdAt: new Date() });
  await db.collection('loginEvents').insertOne({ email: email.toLowerCase(), at: new Date(), event: 'login' });

  return { ok: true, token, expiresAt };
}

// ── Session validation (middleware helper) ──
export async function validateSession(token) {
  if (!token) return false;
  const db = await getDb();
  const s = await db.collection('sessions').findOne({ token });
  if (!s || s.expiresAt < new Date()) return false;
  return s;
}

export async function destroySession(token) {
  if (!token) return;
  const db = await getDb();
  await db.collection('sessions').deleteOne({ token });
}
