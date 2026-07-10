// Application records store (MongoDB collection "applications").
// Each record tracks a job the pipeline prepared a tailored CV for, plus
// whether you've actually applied.

import { ObjectId } from 'mongodb';
import { getDb, isConfigured } from '../db.js';

const COLLECTION = 'applications';

// Upsert a prepared application (keyed by job url so re-runs don't duplicate).
export async function saveApplication(app) {
  if (!isConfigured()) return null;
  const db = await getDb();
  const now = new Date();
  const doc = {
    title: app.title,
    company: app.company,
    location: app.location || '',
    remote: app.remote ?? false,
    salary: app.salary || '',
    source: app.source || '',
    url: app.url,
    baseScore: app.baseScore ?? null,
    tailoredScore: app.tailoredScore ?? null,
    meetsTarget: app.meetsTarget ?? false,
    incorporated: app.incorporated || [],
    matched: app.matched || [],
    missingSkills: app.missingSkills || [],
    matchReason: app.matchReason || [],
    interviewQuestions: app.interviewQuestions || [],
    resumeHtml: app.resumeHtml || '',
    coverLetter: app.coverLetter || '',
    files: app.files || [],
    status: app.status || 'prepared', // prepared | applied | interviewing | rejected | offer
    updatedAt: now,
  };
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    { url: app.url },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value || res; // driver version differences
}

export async function getApplications(filter = {}) {
  if (!isConfigured()) return [];
  const db = await getDb();
  // Exclude the heavy resumeHtml blob from list responses.
  return db.collection(COLLECTION).find(filter, { projection: { resumeHtml: 0 } }).sort({ updatedAt: -1 }).toArray();
}

export async function getApplicationById(id) {
  if (!isConfigured()) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

// Update status and/or applied link for one record.
export async function updateApplication(id, patch) {
  if (!isConfigured()) return null;
  const db = await getDb();
  const allowed = {};
  for (const k of ['status', 'appliedUrl', 'notes', 'appliedAt']) {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  }
  allowed.updatedAt = new Date();
  if (patch.status === 'applied' && !patch.appliedAt) allowed.appliedAt = new Date();
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: allowed },
    { returnDocument: 'after' }
  );
  return res.value || res;
}

export async function stats() {
  const apps = await getApplications();
  const by = (s) => apps.filter((a) => a.status === s).length;
  return {
    total: apps.length,
    prepared: by('prepared'),
    applied: by('applied'),
    interviewing: by('interviewing'),
    offer: by('offer'),
    rejected: by('rejected'),
  };
}

// Delete a single application by ID.
export async function deleteApplication(id) {
  if (!isConfigured()) return null;
  const db = await getDb();
  const res = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount;
}

// Delete all applications (clear the collection).
export async function deleteAllApplications() {
  if (!isConfigured()) return 0;
  const db = await getDb();
  const res = await db.collection(COLLECTION).deleteMany({});
  return res.deletedCount;
}

