// Email + password + emailed-OTP login for the private dashboard.
// Uses Node's built-in crypto (no bcrypt/jwt deps). All auth data lives in
// MongoDB collections: otps, sessions, loginEvents.

import crypto from 'node:crypto';
import { getDb } from './db.js';
import { sendEmail } from './jobs/notify.js';

const OTP_TTL = () => (Number(process.env.OTP_TTL_MINUTES || 10)) * 60 * 1000;
const SESSION_TTL = () => (Number(process.env.SESSION_TTL_HOURS || 12)) * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

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

// ── Step 1: email + password → generate & email a 6-digit code ──
export async function requestCode(email, password) {
  if (!emailMatches(email)) return { ok: false, error: 'Invalid email or password' };
  if (!verifyPassword(password)) return { ok: false, error: 'Invalid email or password' };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  console.log(`[LOCAL DEV] GENERATED LOGIN CODE: ${code}`);
  const db = await getDb();
  await db.collection('otps').insertOne({
    email: email.toLowerCase(),
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + OTP_TTL()),
    used: false,
    createdAt: new Date(),
  });

  await sendEmail(
    'Your dashboard login code',
    `<div style="font-family:sans-serif">
       <h2>Dashboard login code</h2>
       <p>Your one-time code is:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
       <p>It expires in ${process.env.OTP_TTL_MINUTES || 10} minutes. If you didn't request this, ignore this email.</p>
     </div>`
  );
  return { ok: true };
}

// ── Step 2: verify code → issue a session token ──
export async function verifyCode(email, code) {
  if (!emailMatches(email)) return { ok: false, error: 'Invalid request' };
  const db = await getDb();
  const rec = await db.collection('otps').findOne(
    { email: email.toLowerCase(), codeHash: sha256(String(code)), used: false },
    { sort: { createdAt: -1 } }
  );
  if (!rec) return { ok: false, error: 'Incorrect code' };
  if (rec.expiresAt < new Date()) return { ok: false, error: 'Code expired — request a new one' };

  await db.collection('otps').updateOne({ _id: rec._id }, { $set: { used: true } });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL());
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
