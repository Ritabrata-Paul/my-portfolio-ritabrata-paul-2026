// Dynamic resume generator.
// Fetches live GitHub repos, merges them with the base resume.json projects,
// and generates PDF + Word (.docx) files on demand (cached for 10 min).

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResumeHtml } from './jobs/render.js';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle,
} from 'docx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = join(__dirname, 'cv', 'resume.json');
const GITHUB_USER = process.env.GITHUB_USER || 'Ritabrata-Paul';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Cache ──
let cache = { pdf: null, docx: null, resume: null, ts: 0 };

// ── GitHub fetch ──
async function fetchGitHubRepos() {
  try {
    const res = await fetch(
      `https://api.github.com/users/${GITHUB_USER}/repos?sort=updated&per_page=50`
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = await res.json();
    if (!Array.isArray(repos)) return [];

    // Filter out forks, sort by stars then recent push
    return repos
      .filter((r) => !r.fork)
      .sort((a, b) => {
        if (b.stargazers_count !== a.stargazers_count)
          return b.stargazers_count - a.stargazers_count;
        return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
      });
  } catch (err) {
    console.warn('GitHub repos fetch failed:', err.message);
    return [];
  }
}

// Convert a GitHub repo to a resume project entry
function repoToProject(repo) {
  const keywords = [];
  if (repo.language) keywords.push(repo.language);
  (repo.topics || []).forEach((t) => {
    const k = t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!keywords.includes(k) && !keywords.includes(repo.language)) keywords.push(k);
  });
  if (keywords.length === 0) keywords.push('GitHub Project');

  const created = repo.created_at ? repo.created_at.slice(0, 7) : '';
  const updated = repo.pushed_at ? repo.pushed_at.slice(0, 7) : '';

  // Humanize repo name: "my-cool-repo" -> "My Cool Repo"
  const name = repo.name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const highlights = [];
  if (repo.description) highlights.push(repo.description);
  if (repo.stargazers_count > 0)
    highlights.push(`${repo.stargazers_count} stars on GitHub`);
  if (repo.homepage) highlights.push(`Live at: ${repo.homepage}`);
  if (highlights.length === 0) highlights.push(`Open-source project on GitHub.`);

  return {
    name,
    startDate: created,
    endDate: updated,
    description: repo.description || `${name} — open-source project.`,
    highlights,
    keywords,
    url: repo.html_url,
  };
}

// Merge manual projects with GitHub repos (deduplicate by name similarity)
function mergeProjects(manualProjects, githubRepos, maxGitHub = 4) {
  const manualNames = new Set(
    manualProjects.map((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );

  const ghProjects = [];
  for (const repo of githubRepos) {
    const normalized = repo.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Skip if this repo name closely matches an existing manual project
    if (manualNames.has(normalized)) continue;
    ghProjects.push(repoToProject(repo));
    if (ghProjects.length >= maxGitHub) break;
  }

  return [...manualProjects, ...ghProjects];
}

// ── Load base resume with merged projects ──
async function loadEnrichedResume() {
  const resume = JSON.parse(await readFile(RESUME_PATH, 'utf-8'));
  const repos = await fetchGitHubRepos();

  if (repos.length > 0) {
    resume.projects = mergeProjects(resume.projects || [], repos, 4);
  }

  return resume;
}

// ── PDF generation (via Puppeteer) ──
async function generatePdf(resume) {
  // buildResumeHtml expects (resume, tailored, job) — pass empty tailored + null job
  const html = buildResumeHtml(resume, {}, null);

  try {
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.warn('PDF generation via Puppeteer failed:', err.message);
    // Fallback: return null (the endpoint will handle it)
    return null;
  }
}

// ── Word (.docx) generation ──
const BLUE = '2563EB';
const DARK = '1E293B';
const GRAY = '64748B';

function docHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 80 },
    border: level === HeadingLevel.HEADING_1
      ? { bottom: { style: BorderStyle.SINGLE, size: 1, color: BLUE } }
      : {},
    children: [
      new TextRun({ text, bold: true, size: level === HeadingLevel.HEADING_1 ? 26 : 22, color: DARK }),
    ],
  });
}

function docBullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, color: DARK })],
  });
}

function docDateLine(title, subtitle, dates) {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({ text: title, bold: true, size: 22, color: DARK }),
      new TextRun({ text: ` — ${subtitle}`, italics: true, size: 20, color: GRAY }),
      new TextRun({ text: `  (${dates})`, size: 18, color: GRAY }),
    ],
  });
}

async function generateDocx(resume) {
  const sections = [];
  const b = resume.basics;

  // Header
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 40 },
      children: [new TextRun({ text: b.name, bold: true, size: 36, color: DARK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 40 },
      children: [new TextRun({ text: b.label, size: 24, color: BLUE })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 20 },
      children: [
        new TextRun({ text: b.email, size: 20, color: GRAY }),
        new TextRun({ text: '  |  ', size: 20, color: GRAY }),
        new TextRun({
          text: `${b.location.city}, ${b.location.region}, ${b.location.country}`,
          size: 20, color: GRAY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: (b.profiles || []).flatMap((p, i) => {
        const parts = [];
        if (i > 0) parts.push(new TextRun({ text: '  |  ', size: 18, color: GRAY }));
        parts.push(new TextRun({ text: `${p.network}: ${p.url}`, size: 18, color: BLUE }));
        return parts;
      }),
    }),
  );

  // Summary
  sections.push(docHeading('SUMMARY'));
  sections.push(new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: b.summary, size: 20, color: DARK })],
  }));

  // Experience
  sections.push(docHeading('EXPERIENCE'));
  for (const job of (resume.work || [])) {
    const end = job.endDate || 'Present';
    sections.push(docDateLine(job.position, job.name, `${job.startDate} – ${end}`));
    for (const h of (job.highlights || [])) sections.push(docBullet(h));
  }

  // Internships
  if (resume.internships?.length) {
    sections.push(docHeading('INTERNSHIPS'));
    for (const intern of resume.internships) {
      sections.push(docDateLine(intern.position, intern.name, `${intern.startDate} – ${intern.endDate}`));
      for (const h of (intern.highlights || [])) sections.push(docBullet(h));
    }
  }

  // Education
  sections.push(docHeading('EDUCATION'));
  for (const edu of (resume.education || [])) {
    sections.push(docDateLine(`${edu.studyType} in ${edu.area}`, edu.institution, `${edu.startDate} – ${edu.endDate}`));
    if (edu.score) sections.push(docBullet(`Score: ${edu.score}`));
  }

  // Projects (this now includes GitHub repos!)
  sections.push(docHeading('PROJECTS'));
  for (const proj of (resume.projects || [])) {
    const kw = (proj.keywords || []).join(', ');
    sections.push(docDateLine(proj.name, kw, `${proj.startDate} – ${proj.endDate}`));
    for (const h of (proj.highlights || [])) sections.push(docBullet(h));
    if (proj.url) sections.push(docBullet(`GitHub: ${proj.url}`));
  }

  // Skills
  sections.push(docHeading('SKILLS'));
  const skillCategories = {
    'Frontend': resume.skills?.frontend,
    'Backend': resume.skills?.backend,
    'Databases': resume.skills?.databases,
    'Cloud & DevOps': resume.skills?.cloud_devops,
    'Cybersecurity': resume.skills?.cybersecurity,
    'Other': resume.skills?.other,
  };
  for (const [cat, items] of Object.entries(skillCategories)) {
    if (!items?.length) continue;
    sections.push(new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `${cat}: `, bold: true, size: 20, color: DARK }),
        new TextRun({ text: items.join(', '), size: 20, color: GRAY }),
      ],
    }));
  }

  // Certifications
  if (resume.certifications?.length) {
    sections.push(docHeading('CERTIFICATIONS'));
    for (const cert of resume.certifications) sections.push(docBullet(cert));
  }

  // Areas of Interest
  if (resume.interests?.length) {
    sections.push(docHeading('AREAS OF INTEREST'));
    sections.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: resume.interests.join(', '), size: 20, color: DARK })],
    }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ children: sections }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ── Public API ──

// Returns { pdf: Buffer|null, docx: Buffer, resume: object }
export async function getResume() {
  const now = Date.now();

  // Serve from cache if still fresh
  if (cache.ts && (now - cache.ts) < CACHE_TTL_MS && cache.docx) {
    return cache;
  }

  console.log('Regenerating resume files (cache expired or first run)...');
  const resume = await loadEnrichedResume();
  const [pdf, docx] = await Promise.all([
    generatePdf(resume),
    generateDocx(resume),
  ]);

  cache = { pdf, docx, resume, ts: Date.now() };
  console.log(`Resume generated: PDF=${pdf ? `${(pdf.length / 1024).toFixed(1)}KB` : 'unavailable'}, DOCX=${(docx.length / 1024).toFixed(1)}KB, Projects=${resume.projects.length}`);
  return cache;
}

// Force regeneration (e.g. after updating resume.json)
export function invalidateCache() {
  cache = { pdf: null, docx: null, resume: null, ts: 0 };
}

// Pre-warm cache on server start
export async function warmCache() {
  try {
    await getResume();
    console.log('Resume cache warmed successfully.');
  } catch (err) {
    console.warn('Resume cache warm-up failed:', err.message);
  }
}
