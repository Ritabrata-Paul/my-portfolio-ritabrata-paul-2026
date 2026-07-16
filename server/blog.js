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
  // coverImage can be a multi-MB data URI — served via /api/blog/:slug/cover.
  return db.collection(COLLECTION)
    .find({ published: true }, { projection: { content: 0, coverImage: 0 } })
    .sort({ publishedAt: -1, createdAt: -1 })
    .toArray();
}

export async function getPublishedBySlug(slug) {
  if (!isConfigured()) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ slug, published: true }, { projection: { coverImage: 0 } });
}

// ── Admin reads/writes ──
export async function listAll() {
  if (!isConfigured()) return [];
  const db = await getDb();
  return db.collection(COLLECTION)
    .find({}, { projection: { content: 0, coverImage: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function getById(id) {
  if (!isConfigured()) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ _id: new ObjectId(id) }, { projection: { coverImage: 0 } });
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

// ── Cover images ──
// AI cover via OpenAI (DALL·E 3). Falls back to a generated SVG banner so a
// post is never blocked by image-API failures.

function svgCover(title, dateStr) {
  // Deterministic gradient hue from the title.
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const h2 = (h + 60) % 360;
  const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Wrap the title across up to 3 lines of ~28 chars.
  const words = String(title).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 28 && lines.length < 3) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  const titleSpans = lines.map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 58}">${escXml(l)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h},70%,16%)"/>
      <stop offset="1" stop-color="hsl(${h2},65%,28%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1050" cy="120" r="220" fill="hsl(${h2},70%,45%)" opacity="0.18"/>
  <circle cx="120" cy="560" r="180" fill="hsl(${h},70%,55%)" opacity="0.14"/>
  <text x="80" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff">${titleSpans}</text>
  <text x="80" y="540" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#ffffffcc">Posted by Ritabrata Paul  ·  ${escXml(dateStr)}</text>
</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export async function generateCoverImage({ title, tags = [] }) {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `Modern, minimal blog cover illustration for a software-development article titled "${title}"` +
        (tags.length ? ` (topics: ${tags.join(', ')})` : '') +
        `. Abstract geometric shapes, dark navy background with teal and violet accents, clean flat vector style. ` +
        `Strictly NO text, NO letters, NO words, NO logos in the image.`;
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-image-1-mini', prompt, n: 1, size: '1536x1024', quality: 'medium' }),
      });
      if (res.ok) {
        const data = await res.json();
        const item = data.data?.[0] || {};
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        if (item.url) {
          // Newer API returns a temporary URL — fetch and store the bytes.
          const img = await fetch(item.url);
          if (img.ok) {
            const buf = Buffer.from(await img.arrayBuffer());
            const mime = img.headers.get('content-type') || 'image/png';
            return `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
      } else {
        console.warn('DALL-E cover failed:', res.status, (await res.text()).replace(/\s+/g, ' ').slice(0, 200));
      }
    } catch (err) {
      console.warn('DALL-E cover error:', err.message);
    }
  }
  return svgCover(title, dateStr); // fallback — never blocks posting
}

// Return only the stored cover for a published post (for the /cover endpoint).
export async function getCoverBySlug(slug) {
  if (!isConfigured()) return null;
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne(
    { slug, published: true },
    { projection: { coverImage: 1 } }
  );
  return doc?.coverImage || null;
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
