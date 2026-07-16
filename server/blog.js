// Blog post store (MongoDB collection "posts").
// Posts are authored/managed from the private dashboard and displayed on the
// public portfolio at /blog and /blog/:slug.

import { ObjectId } from 'mongodb';
import { getDb, isConfigured } from './db.js';

const COLLECTION = 'posts';

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'post';
}

function makeExcerpt(markdown, manual) {
  if (manual) return manual;
  const plain = String(markdown || '')
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/[#>*_`~\-]/g, '')          // md symbols
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 180) + (plain.length > 180 ? '…' : '');
}

// Ensure a slug is unique (append -2, -3, … if needed).
async function uniqueSlug(db, base, excludeId) {
  let slug = base, n = 1;
  while (true) {
    const clash = await db.collection(COLLECTION).findOne({ slug, ...(excludeId ? { _id: { $ne: new ObjectId(excludeId) } } : {}) });
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// ── Public reads ──
export async function listPublished() {
  if (!isConfigured()) return [];
  const db = await getDb();
  return db.collection(COLLECTION)
    .find({ published: true }, { projection: { content: 0 } })
    .sort({ publishedAt: -1, createdAt: -1 })
    .toArray();
}

export async function getPublishedBySlug(slug) {
  if (!isConfigured()) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ slug, published: true });
}

// ── Admin reads/writes ──
export async function listAll() {
  if (!isConfigured()) return [];
  const db = await getDb();
  return db.collection(COLLECTION)
    .find({}, { projection: { content: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function getById(id) {
  if (!isConfigured()) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function createPost(data) {
  const db = await getDb();
  const now = new Date();
  const published = !!data.published;
  const doc = {
    title: data.title || 'Untitled',
    slug: await uniqueSlug(db, slugify(data.slug || data.title)),
    content: data.content || '',
    excerpt: makeExcerpt(data.content, data.excerpt),
    tags: Array.isArray(data.tags) ? data.tags : (data.tags ? String(data.tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
    coverImage: data.coverImage || '',
    published,
    createdAt: now,
    updatedAt: now,
    publishedAt: published ? now : null,
  };
  const { insertedId } = await db.collection(COLLECTION).insertOne(doc);
  return { _id: insertedId, ...doc };
}

export async function updatePost(id, data) {
  const db = await getDb();
  const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  if (!existing) throw new Error('Post not found');
  const now = new Date();
  const published = data.published !== undefined ? !!data.published : existing.published;
  const set = {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.slug !== undefined ? { slug: await uniqueSlug(db, slugify(data.slug || data.title || existing.title), id) } : {}),
    ...(data.content !== undefined ? { content: data.content, excerpt: makeExcerpt(data.content, data.excerpt) } : {}),
    ...(data.tags !== undefined ? { tags: Array.isArray(data.tags) ? data.tags : String(data.tags).split(',').map((t) => t.trim()).filter(Boolean) } : {}),
    ...(data.coverImage !== undefined ? { coverImage: data.coverImage } : {}),
    published,
    updatedAt: now,
    // stamp publishedAt the first time it goes public
    ...(published && !existing.publishedAt ? { publishedAt: now } : {}),
  };
  await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: set });
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function deletePost(id) {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return { ok: true };
}

// ── AI draft: turn a title / bullet points into a full Markdown blog post ──
export async function aiDraftPost({ topic, notes = '', tone = 'professional and friendly' }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const apiUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
  const version = process.env.ANTHROPIC_VERSION || '2023-06-01';
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const prompt = `Write a blog post for a software developer's personal portfolio blog.

Topic / title: ${topic}
${notes ? `Author's notes / bullet points to cover:\n${notes}\n` : ''}
Tone: ${tone}.

Rules:
- Write in Markdown (use ##/### headings, bullet lists, and \`\`\`code blocks where relevant).
- 400-700 words. Start directly with the content (no top-level # title — the title is stored separately).
- Practical, genuine, first-person voice. No filler or clichés.

Return ONLY a JSON object (no markdown fences):
{
  "title": "a clear, engaging post title",
  "excerpt": "1-2 sentence summary (under 180 chars)",
  "tags": ["3-5 relevant lowercase tags"],
  "content": "the full post body in Markdown"
}`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': version },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const raw = (data.content?.find((c) => c.type === 'text')?.text || '').trim();
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s !== -1 && e > s) return JSON.parse(cleaned.slice(s, e + 1));
    throw new Error('Could not parse AI draft as JSON');
  }
}
