// Job-source fetchers. All normalize to a common shape:
// { id, source, title, company, location, url, description, tags[], publishedAt }
//
// Remotive & Arbeitnow are fully open (no key). Jooble needs JOOBLE_API_KEY.

const stripHtml = (s = '') =>
  s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// ── Remotive ──────────────────────────────────────────────
export async function fetchRemotive(query, limit = 40) {
  try {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      id: `remotive-${j.id}`,
      source: 'Remotive',
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || 'Remote',
      remote: true,
      salary: j.salary || '',
      url: j.url,
      description: stripHtml(j.description),
      tags: j.tags || [],
      publishedAt: j.publication_date || '',
    }));
  } catch (err) {
    console.error('Remotive fetch failed:', err.message);
    return [];
  }
}

// ── Arbeitnow ─────────────────────────────────────────────
export async function fetchArbeitnow(query) {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
    const data = await res.json();
    const q = query.toLowerCase();
    return (data.data || [])
      .map((j) => ({
        id: `arbeitnow-${j.slug}`,
        source: 'Arbeitnow',
        title: j.title,
        company: j.company_name,
        location: j.location || (j.remote ? 'Remote' : ''),
        remote: !!j.remote,
        salary: '',
        url: j.url,
        description: stripHtml(j.description),
        tags: j.tags || [],
        publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : '',
      }))
      // Arbeitnow has no search param — filter client-side against the query.
      .filter((j) =>
        `${j.title} ${j.description} ${j.tags.join(' ')}`.toLowerCase().includes(q)
      );
  } catch (err) {
    console.error('Arbeitnow fetch failed:', err.message);
    return [];
  }
}

// ── Jooble ────────────────────────────────────────────────
export async function fetchJooble(query, location = '') {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) {
    console.warn('JOOBLE_API_KEY not set — skipping Jooble.');
    return [];
  }
  try {
    const res = await fetch(`https://jooble.org/api/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: query, location }),
    });
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      id: `jooble-${j.id}`,
      source: 'Jooble',
      title: j.title,
      company: j.company || '',
      location: j.location || '',
      remote: /remote/i.test(`${j.location} ${j.type}`),
      salary: j.salary || '',
      url: j.link,
      description: stripHtml(j.snippet),
      tags: [],
      publishedAt: j.updated || '',
    }));
  } catch (err) {
    console.error('Jooble fetch failed:', err.message);
    return [];
  }
}

// ── Aggregate + de-dupe across all sources ────────────────
export async function fetchAllJobs(queries, location = '') {
  const all = [];
  for (const q of queries) {
    const [rem, arb, joo] = await Promise.all([
      fetchRemotive(q),
      fetchArbeitnow(q),
      fetchJooble(q, location),
    ]);
    all.push(...rem, ...arb, ...joo);
  }
  // De-dupe by id, then by (title+company) to catch cross-source repeats.
  const seen = new Set();
  const unique = [];
  for (const job of all) {
    const key = `${job.title}|${job.company}`.toLowerCase();
    if (seen.has(job.id) || seen.has(key)) continue;
    seen.add(job.id);
    seen.add(key);
    unique.push(job);
  }
  return unique;
}
