// Job-hunt pipeline orchestrator.
//   fetch jobs → score (ATS) → keep best → enrich from GitHub →
//   tailor CV with Claude → re-score → render CV/cover letter → notify.
//
// Run locally:  node jobs/pipeline.js
// Config via .env (see .env.example).

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';

import { fetchAllJobs } from './sources.js';
import { scoreMatch, resumeToText } from './ats.js';
import { tailorResume } from './tailor.js';
import { renderResume, buildResumeHtml } from './render.js';
import { saveApplication } from './store.js';
import { isConfigured, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '.env') });

// ── Tunables (override via .env) ──
const QUERIES = (process.env.JOB_QUERIES ||
  'full stack developer,react developer,devops engineer,node.js developer,backend developer')
  .split(',').map((s) => s.trim());
const LOCATION = process.env.JOB_LOCATION || 'India';
const PRE_SCORE_MIN = Number(process.env.PRE_SCORE_MIN || 30); // relevance gate before spending Claude tokens
const TARGET_SCORE = Number(process.env.TARGET_SCORE || 90);   // desired ATS match
const MAX_TAILOR = Number(process.env.MAX_TAILOR || 10);       // cap Claude calls per run

const GITHUB_USER = process.env.GITHUB_USER || 'Ritabrata-Paul';

// Pull languages + topics from the user's public repos so tailoring reflects
// what they actually build. Returns a string of genuine, evidenced tech terms.
async function fetchGitHubTech(user) {
  try {
    const res = await fetch(`https://api.github.com/users/${user}/repos?sort=updated&per_page=50`);
    const repos = await res.json();
    if (!Array.isArray(repos)) return '';
    const langs = new Set();
    const topics = new Set();
    for (const r of repos) {
      if (r.language) langs.add(r.language);
      (r.topics || []).forEach((t) => topics.add(t));
    }
    return [...langs, ...topics].join(', ');
  } catch (err) {
    console.warn('GitHub enrichment skipped:', err.message);
    return '';
  }
}

async function main() {
  const outDir = join(__dirname, '..', 'output', new Date().toISOString().slice(0, 10));
  await mkdir(outDir, { recursive: true });

  const resume = JSON.parse(await readFile(join(__dirname, '..', 'cv', 'resume.json'), 'utf-8'));

  // Enrich resume text (used for scoring) with real GitHub tech.
  const ghTech = await fetchGitHubTech(GITHUB_USER);
  if (ghTech) console.log(`GitHub tech: ${ghTech}`);
  const resumeText = resumeToText(resume) + ' ' + ghTech;

  console.log(`Fetching jobs for: ${QUERIES.join(' | ')} (${LOCATION})`);
  const jobs = await fetchAllJobs(QUERIES, LOCATION);
  console.log(`Found ${jobs.length} unique jobs.`);

  // Score every job, keep those above the relevance gate, best first.
  const scored = jobs
    .map((job) => ({ job, ...scoreMatch(resumeText, `${job.title} ${job.description} ${job.tags.join(' ')}`) }))
    .filter((s) => s.score >= PRE_SCORE_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TAILOR);

  console.log(`${scored.length} jobs pass the ${PRE_SCORE_MIN}% relevance gate; tailoring...`);

  const results = [];
  for (const [i, s] of scored.entries()) {
    const { job } = s;
    console.log(`\n[${i + 1}/${scored.length}] ${job.title} @ ${job.company} — base match ${s.score}%`);
    try {
      const tailored = await tailorResume(resume, job, { matched: s.matched, missing: s.missing });

      // Re-score using the tailored summary + highlights + skill order.
      const tailoredText =
        resumeToText(resume) + ' ' + ghTech + ' ' +
        (tailored.summary || '') + ' ' +
        (tailored.highlights || []).join(' ') + ' ' +
        (tailored.skillsOrder || []).join(' ');
      const after = scoreMatch(tailoredText, `${job.title} ${job.description} ${job.tags.join(' ')}`);
      console.log(`  Tailored match: ${after.score}%  (target ${TARGET_SCORE}%)`);

      const slug = `${job.company}-${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
      const base = join(outDir, `${String(i + 1).padStart(2, '0')}-${slug}`);
      const files = await renderResume(resume, tailored, job, base);
      await writeFile(`${base}-cover-letter.txt`, tailored.coverLetter || '', 'utf-8');

      // Full standalone HTML of the tailored resume — stored for dashboard download.
      const resumeHtml = buildResumeHtml(resume, tailored, job);

      const record = {
        title: job.title, company: job.company, location: job.location,
        remote: job.remote, salary: job.salary,
        source: job.source, url: job.url,
        baseScore: s.score, tailoredScore: after.score,
        meetsTarget: after.score >= TARGET_SCORE,
        incorporated: tailored.incorporatedKeywords || [],
        matched: s.matched,
        missingSkills: tailored.missingSkills || after.missing || [],
        matchReason: tailored.matchReason || [],
        interviewQuestions: tailored.interviewQuestions || [],
        resumeHtml,
        coverLetter: tailored.coverLetter || '',
        files: files.map((f) => f.replace(outDir + '\\', '').replace(outDir + '/', '')),
      };
      // Keep the on-disk report light (no big HTML blob).
      const { resumeHtml: _omit, ...lightRecord } = record;
      results.push(lightRecord);

      // Persist to MongoDB so the private dashboard can track it.
      if (isConfigured()) {
        try {
          await saveApplication({ ...record, status: 'prepared' });
        } catch (err) {
          console.warn(`  (DB save failed: ${err.message.split('\n')[0]})`);
        }
      }
    } catch (err) {
      console.error(`  Tailoring failed: ${err.message}`);
    }
  }

  // Write run report (JSON + human-readable).
  results.sort((a, b) => b.tailoredScore - a.tailoredScore);
  await writeFile(join(outDir, 'report.json'), JSON.stringify(results, null, 2), 'utf-8');

  const rows = results.map((r) =>
    `- [${r.tailoredScore}%] ${r.title} @ ${r.company} (${r.source}) ${r.meetsTarget ? '✅' : ''}\n    ${r.url}`
  ).join('\n');
  const summary = `# Job Hunt — ${new Date().toLocaleString()}\n\n${results.length} tailored applications ready (target ${TARGET_SCORE}%+):\n\n${rows}\n`;
  await writeFile(join(outDir, 'report.md'), summary, 'utf-8');

  console.log(`\nDone. ${results.length} tailored packages in ${outDir}`);
  console.log(`${results.filter((r) => r.meetsTarget).length} meet the ${TARGET_SCORE}% target.`);

  if (isConfigured()) await closeDb();
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
