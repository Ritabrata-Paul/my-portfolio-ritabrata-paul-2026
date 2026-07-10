/**
 * Generate a Word (.docx) resume from the JSON resume data.
 * Run: node generate-docx.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TabStopPosition, TabStopType
} from 'docx';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resume = JSON.parse(readFileSync(resolve(__dirname, 'server/cv/resume.json'), 'utf-8'));

// ── Helpers ──
const BLUE = '2563EB';
const DARK = '1E293B';
const GRAY = '64748B';

function heading(text, level = HeadingLevel.HEADING_1) {
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

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, color: DARK })],
  });
}

function dateLine(title, subtitle, dates) {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({ text: title, bold: true, size: 22, color: DARK }),
      new TextRun({ text: ` — ${subtitle}`, italics: true, size: 20, color: GRAY }),
      new TextRun({ text: `  (${dates})`, size: 18, color: GRAY }),
    ],
  });
}

// ── Build document ──
const sections = [];

// Header — name + title
sections.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: resume.basics.name, bold: true, size: 36, color: DARK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: resume.basics.label, size: 24, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({ text: resume.basics.email, size: 20, color: GRAY }),
      new TextRun({ text: '  |  ', size: 20, color: GRAY }),
      new TextRun({
        text: `${resume.basics.location.city}, ${resume.basics.location.region}, ${resume.basics.location.country}`,
        size: 20, color: GRAY,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: resume.basics.profiles.map((p, i) => {
      const parts = [];
      if (i > 0) parts.push(new TextRun({ text: '  |  ', size: 18, color: GRAY }));
      parts.push(new TextRun({ text: `${p.network}: ${p.url}`, size: 18, color: BLUE }));
      return parts;
    }).flat(),
  }),
);

// Summary
sections.push(heading('SUMMARY'));
sections.push(new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({ text: resume.basics.summary, size: 20, color: DARK })],
}));

// Experience
sections.push(heading('EXPERIENCE'));
for (const job of resume.work) {
  const end = job.endDate || 'Present';
  sections.push(dateLine(job.position, job.name, `${job.startDate} – ${end}`));
  for (const h of job.highlights) sections.push(bullet(h));
}

// Internships
sections.push(heading('INTERNSHIPS'));
for (const intern of resume.internships) {
  sections.push(dateLine(intern.position, intern.name, `${intern.startDate} – ${intern.endDate}`));
  for (const h of intern.highlights) sections.push(bullet(h));
}

// Education
sections.push(heading('EDUCATION'));
for (const edu of resume.education) {
  sections.push(dateLine(edu.studyType + ' in ' + edu.area, edu.institution, `${edu.startDate} – ${edu.endDate}`));
  sections.push(bullet(`Score: ${edu.score}`));
}

// Projects
sections.push(heading('PROJECTS'));
for (const proj of resume.projects) {
  sections.push(dateLine(proj.name, proj.keywords.join(', '), `${proj.startDate} – ${proj.endDate}`));
  for (const h of proj.highlights) sections.push(bullet(h));
}

// Skills
sections.push(heading('SKILLS'));
const skillCategories = {
  'Frontend': resume.skills.frontend,
  'Backend': resume.skills.backend,
  'Databases': resume.skills.databases,
  'Cloud & DevOps': resume.skills.cloud_devops,
  'Cybersecurity': resume.skills.cybersecurity,
  'Other': resume.skills.other,
};
for (const [cat, items] of Object.entries(skillCategories)) {
  sections.push(new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${cat}: `, bold: true, size: 20, color: DARK }),
      new TextRun({ text: items.join(', '), size: 20, color: GRAY }),
    ],
  }));
}

// Certifications
sections.push(heading('CERTIFICATIONS'));
for (const cert of resume.certifications) sections.push(bullet(cert));

// Areas of Interest
sections.push(heading('AREAS OF INTEREST'));
sections.push(new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({ text: resume.interests.join(', '), size: 20, color: DARK })],
}));

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri' } },
    },
  },
  sections: [{ children: sections }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(resolve(__dirname, 'public', 'Ritabrata Paul.docx'), buf);
console.log('✅ Generated public/Ritabrata Paul.docx');
