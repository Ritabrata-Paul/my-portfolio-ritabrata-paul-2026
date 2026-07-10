// Render a tailored resume to a print-ready HTML file, and to PDF when
// Puppeteer is installed (optional — dynamic import, graceful fallback).

import { writeFile } from 'node:fs/promises';

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Strip emoji codepoints and variation selectors from any string.
function stripEmoji(s = '') {
  return s
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{200D}\u{20E3}]/gu, '')
    .trim();
}

function fmtDate(d) {
  if (!d) return 'Present';
  const [y, m] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m ? `${months[parseInt(m, 10) - 1]} ${y}` : y;
}

export function buildResumeHtml(resume, tailored, job) {
  const b = resume.basics;
  const profiles = (b.profiles || [])
    .map((p) => `<a href="${esc(p.url)}">${esc(p.network)}</a>`)
    .join('  |  ');

  // --- Experience ---
  const workHtml = (resume.work || [])
    .map(
      (w) => `
      <div class="item">
        <div class="row"><strong>${esc(w.position)}</strong><span>${fmtDate(w.startDate)} - ${fmtDate(w.endDate)}</span></div>
        <div class="company">${esc(w.name)}</div>
        <ul>${(w.highlights || []).map((h) => `<li>${esc(stripEmoji(h))}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  // --- Internships ---
  const internHtml = (resume.internships || [])
    .map(
      (i) => `
      <div class="item">
        <div class="row"><strong>${esc(i.position)}</strong><span>${fmtDate(i.startDate)} - ${fmtDate(i.endDate)}</span></div>
        <div class="company">${esc(i.name)}</div>
        <ul>${(i.highlights || []).map((h) => `<li>${esc(stripEmoji(h))}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  // --- Projects ---
  const projHtml = (resume.projects || [])
    .map(
      (p) => `
      <div class="item">
        <div class="row"><strong>${esc(p.name)}</strong><span>${fmtDate(p.startDate)} - ${fmtDate(p.endDate)}</span></div>
        <div class="tech">${esc(p.keywords?.join(', ') || '')}</div>
        <ul>${(p.highlights || []).map((h) => `<li>${esc(stripEmoji(h))}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  // --- Skills (tailored order if available) ---
  const skillGroups = tailored.skillsOrder && tailored.skillsOrder.length
    ? [{ label: 'Technical Skills', items: tailored.skillsOrder }]
    : [
        { label: 'Frontend', items: resume.skills?.frontend || [] },
        { label: 'Backend', items: resume.skills?.backend || [] },
        { label: 'Databases', items: resume.skills?.databases || [] },
        { label: 'Cloud & DevOps', items: resume.skills?.cloud_devops || [] },
        { label: 'Cybersecurity', items: resume.skills?.cybersecurity || [] },
        { label: 'Other', items: resume.skills?.other || [] },
      ].filter((g) => g.items.length);

  const skillsHtml = skillGroups
    .map((g) => `<div class="skill-row"><span class="skill-label">${esc(g.label)}:</span> ${g.items.map((s) => esc(s)).join(', ')}</div>`)
    .join('');

  // --- Education ---
  const eduHtml = (resume.education || [])
    .map(
      (e) => `
      <div class="item">
        <div class="row"><strong>${esc(e.studyType)} in ${esc(e.area)}</strong><span>${fmtDate(e.startDate)} - ${fmtDate(e.endDate)}</span></div>
        <div class="company">${esc(e.institution)} ${e.score ? '| ' + esc(e.score) : ''}</div>
      </div>`
    )
    .join('');

  // --- Certifications ---
  const certHtml = (resume.certifications || [])
    .map((c) => `<li>${esc(stripEmoji(c))}</li>`)
    .join('');

  // --- Key Highlights (tailored) ---
  const highlightsHtml = (tailored.highlights || [])
    .map((h) => `<li>${esc(stripEmoji(h))}</li>`)
    .join('');

  const summary = stripEmoji(tailored.summary || b.summary || '');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(b.name)} - Resume</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a; max-width: 820px;
    margin: 0 auto; padding: 36px 40px;
    line-height: 1.45; font-size: 12.5px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Header */
  .header { text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2px solid #1a1a1a; }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
  .title { font-size: 14px; font-weight: 500; color: #333; margin-bottom: 6px; }
  .contact { font-size: 11.5px; color: #444; line-height: 1.6; }
  .contact a { color: #1a1a1a; text-decoration: none; }
  .contact a:hover { text-decoration: underline; }
  .contact .sep { margin: 0 6px; color: #999; }
  /* Sections */
  h2 {
    font-size: 13px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; color: #1a1a1a;
    border-bottom: 1.5px solid #1a1a1a;
    padding-bottom: 3px; margin: 16px 0 8px;
  }
  /* Items */
  .item { margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .row strong { font-size: 12.5px; font-weight: 600; }
  .row span { color: #555; font-size: 11px; white-space: nowrap; font-weight: 400; }
  .company { color: #444; font-size: 11.5px; margin-bottom: 2px; }
  .tech { color: #555; font-size: 11px; font-style: italic; margin-bottom: 2px; }
  ul { margin: 3px 0 0; padding-left: 16px; }
  li { margin-bottom: 1.5px; line-height: 1.4; }
  /* Skills */
  .skill-row { margin-bottom: 3px; line-height: 1.5; }
  .skill-label { font-weight: 600; }
  /* Job note */
  .job-note {
    background: #f0f4ff; border: 1px solid #c7d2fe; padding: 6px 12px;
    font-size: 11px; margin-bottom: 14px; border-radius: 3px; color: #333;
  }
  @media print {
    .job-note { display: none; }
    body { padding: 20px 24px; }
  }
</style></head><body>
  ${job ? `<div class="job-note">Tailored for: <strong>${esc(job.title)}</strong> at ${esc(job.company)} (${esc(job.source)})</div>` : ''}
  <div class="header">
    <h1>${esc(b.name)}</h1>
    <div class="title">${esc(b.label)}</div>
    <div class="contact">
      ${esc(b.email)}<span class="sep">|</span>${esc(b.location?.city)}, ${esc(b.location?.region)}, ${esc(b.location?.country)}
      <br>${profiles}
    </div>
  </div>

  <h2>Professional Summary</h2>
  <p style="margin-bottom:4px">${esc(summary)}</p>

  <h2>Technical Skills</h2>
  ${skillsHtml}

  ${highlightsHtml ? `<h2>Key Highlights</h2><ul>${highlightsHtml}</ul>` : ''}

  <h2>Professional Experience</h2>
  ${workHtml}

  ${internHtml ? `<h2>Internships</h2>${internHtml}` : ''}

  <h2>Projects</h2>
  ${projHtml}

  <h2>Education</h2>
  ${eduHtml}

  ${certHtml ? `<h2>Certifications</h2><ul>${certHtml}</ul>` : ''}
</body></html>`;
}

// Write HTML, and PDF if puppeteer is available. Returns list of files written.
export async function renderResume(resume, tailored, job, outBase) {
  const html = buildResumeHtml(resume, tailored, job);
  const htmlPath = `${outBase}.html`;
  await writeFile(htmlPath, html, 'utf-8');
  const written = [htmlPath];

  try {
    const puppeteer = (await import('puppeteer')).default;
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfPath = `${outBase}.pdf`;
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();
    written.push(pdfPath);
  } catch (err) {
    console.warn(`  (PDF skipped — install puppeteer for auto-PDF: ${err.message.split('\\n')[0]})`);
  }
  return written;
}
