// ATS keyword-match scoring.
//
// There is no universal ATS score — a resume is scored RELATIVE to one job
// posting. This module extracts tech/role keywords from a job description and
// measures how many appear in a given resume text. Score = % of the job's
// keywords covered, which is what keyword-based ATS filters actually check.

// Known tech/skill vocabulary. Multi-word terms first so they match before
// their sub-words. Extend freely.
const VOCAB = [
  'react.js', 'react native', 'next.js', 'node.js', 'express.js', 'material ui',
  'rest api', 'restful', 'graphql', 'ci/cd', 'ci cd', 'unit testing', 'test driven',
  'machine learning', 'data structures', 'object oriented', 'micro services', 'microservices',
  'google cloud', 'gcp', 'aws', 'azure', 'kubernetes', 'docker', 'jenkins', 'terraform',
  'grafana', 'prometheus', 'ansible', 'linux', 'kali linux', 'bash', 'shell',
  'javascript', 'typescript', 'python', 'java', 'spring', 'php', 'c++', 'golang', 'go',
  'html', 'css', 'sass', 'tailwind', 'redux', 'vue', 'angular', 'svelte',
  'django', 'flask', 'fastapi', 'asp.net', '.net', 'node', 'nestjs',
  'mongodb', 'mysql', 'postgresql', 'postgres', 'redis', 'sql', 'nosql', 'prisma',
  'socket.io', 'websocket', 'webrtc', 'opencv', 'openai', 'llm',
  'git', 'github', 'gitlab', 'agile', 'scrum', 'devops', 'sre',
  'owasp', 'penetration testing', 'secure coding', 'cybersecurity', 'security',
  'figma', 'adobe xd', 'ui/ux', 'responsive', 'accessibility',
  'full stack', 'fullstack', 'frontend', 'front-end', 'backend', 'back-end',
  'mern', 'commerce.js', 'three.js', 'webgl', 'gsap',
];

const norm = (s = '') => s.toLowerCase();

// Extract the set of known keywords present in a block of text.
export function extractKeywords(text) {
  const t = norm(text);
  const found = new Set();
  for (const term of VOCAB) {
    // word-ish boundary check that tolerates the dots in react.js etc.
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
    if (re.test(t)) found.add(term);
  }
  return found;
}

// Flatten a resume.json into one searchable string.
export function resumeToText(resume) {
  const parts = [];
  parts.push(resume.basics?.label, resume.basics?.summary);
  for (const group of Object.values(resume.skills || {})) parts.push(...group);
  for (const w of resume.work || []) parts.push(w.position, ...(w.highlights || []));
  for (const p of resume.projects || []) parts.push(p.description, ...(p.keywords || []), ...(p.highlights || []));
  for (const i of resume.internships || []) parts.push(i.position, ...(i.highlights || []));
  return parts.filter(Boolean).join(' ');
}

// Score a resume against a job. Returns { score, coverage, matched, missing }.
//
// `coverage` is the raw % of the job's keywords found in the resume. `score`
// dampens that by how many keywords the job actually contains, so a posting
// that only mentions one recognized tech term can't inflate to 100% off a
// single incidental match. Full confidence kicks in at CONFIDENCE_FLOOR keywords.
const CONFIDENCE_FLOOR = 6;

export function scoreMatch(resumeText, jobText) {
  const jobKeywords = extractKeywords(jobText);
  if (jobKeywords.size === 0) return { score: 0, coverage: 0, matched: [], missing: [] };

  const resumeKeywords = extractKeywords(resumeText);
  const matched = [];
  const missing = [];
  for (const kw of jobKeywords) {
    if (resumeKeywords.has(kw)) matched.push(kw);
    else missing.push(kw);
  }
  const coverage = Math.round((matched.length / jobKeywords.size) * 100);
  const confidence = Math.min(1, jobKeywords.size / CONFIDENCE_FLOOR);
  const score = Math.round(coverage * confidence);
  return { score, coverage, matched, missing };
}
