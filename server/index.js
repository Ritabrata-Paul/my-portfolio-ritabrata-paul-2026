import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { getApplications, updateApplication, stats, deleteApplication, deleteAllApplications } from './jobs/store.js';
import { isConfigured } from './db.js';
import { login, validateSession, destroySession } from './auth.js';
import { getResume, warmCache } from './resume-generator.js';

config({ path: '../.env' });

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Dashboard is served by Vite from public/dashboard/.
// All /api data endpoints below require session-token auth.

// ── Auth: email + password → session token ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const out = await login(email, password);
    if (!out.ok) return res.status(401).json(out);
    res.json({ ok: true, token: out.token, expiresAt: out.expiresAt });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  await destroySession(token);
  res.json({ ok: true });
});

// Session-token guard for the data endpoints.
async function requireAuth(req, res, next) {
  try {
    // Accept the token from the Authorization header OR a ?token= query param
    // (download links opened in a new tab can't set headers).
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.token || '';
    const session = await validateSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.session = session;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/applications', requireAuth, async (_req, res) => {
  try {
    if (!isConfigured()) return res.json({ applications: [], stats: {}, dbConfigured: false });
    res.json({ applications: await getApplications(), stats: await stats(), dbConfigured: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/applications/:id', requireAuth, async (req, res) => {
  try {
    const updated = await updateApplication(req.params.id, req.body || {});
    res.json({ application: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/applications/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await deleteApplication(req.params.id);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/applications', requireAuth, async (_req, res) => {
  try {
    const deleted = await deleteAllApplications();
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Blog: public reads + admin CRUD (dashboard) + AI draft ──
import { listPublished, getPublishedBySlug, listAll, getById, createPost, updatePost, deletePost, aiDraftPost } from './blog.js';

// Public — no auth (portfolio /blog pages fetch these).
app.get('/api/blog', async (_req, res) => {
  try { res.json({ posts: await listPublished() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const post = await getPublishedBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin — require a session (dashboard).
app.get('/api/admin/blog', requireAuth, async (_req, res) => {
  try { res.json({ posts: await listAll() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/admin/blog/:id', requireAuth, async (req, res) => {
  try {
    const post = await getById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ post });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/blog', requireAuth, async (req, res) => {
  try { res.json({ post: await createPost(req.body || {}) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch('/api/admin/blog/:id', requireAuth, async (req, res) => {
  try { res.json({ post: await updatePost(req.params.id, req.body || {}) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/admin/blog/:id', requireAuth, async (req, res) => {
  try { res.json(await deletePost(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/admin/blog/ai-draft', requireAuth, async (req, res) => {
  try {
    const { topic, notes, tone } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'A topic or title is required' });
    res.json({ draft: await aiDraftPost({ topic, notes, tone }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// One-click: Claude writes the post AND it goes live immediately.
app.post('/api/admin/blog/ai-post', requireAuth, async (req, res) => {
  try {
    const { topic, notes, tone } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'A topic or title is required' });
    const draft = await aiDraftPost({ topic, notes, tone });
    const post = await createPost({
      title: draft.title || topic,
      content: draft.content || '',
      excerpt: draft.excerpt || '',
      tags: draft.tags || [],
      published: true,
    });
    res.json({ post });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Downloads: tailored resume (printable HTML) + cover letter ──
import { getApplicationById } from './jobs/store.js';

app.get('/api/applications/:id/resume', requireAuth, async (req, res) => {
  try {
    const app = await getApplicationById(req.params.id);
    if (!app || !app.resumeHtml) return res.status(404).send('Resume not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(app.resumeHtml);
  } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/applications/:id/cover-letter', requireAuth, async (req, res) => {
  try {
    const app = await getApplicationById(req.params.id);
    if (!app) return res.status(404).send('Not found');
    const name = `${app.company}-${app.title}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CoverLetter_${name}.txt"`);
    res.send(app.coverLetter || 'No cover letter generated.');
  } catch (err) { res.status(500).send(err.message); }
});

// ── Job-hunt runner: spawns the pipeline (which tailors CVs via Anthropic) ──
let hunt = { running: false, startedAt: null, finishedAt: null, exitCode: null, log: [] };
const pushLog = (line) => { hunt.log.push(line); if (hunt.log.length > 400) hunt.log.shift(); };

app.post('/api/job-hunt/run', requireAuth, (_req, res) => {
  if (hunt.running) return res.status(409).json({ error: 'A job hunt is already running' });
  hunt = { running: true, startedAt: new Date(), finishedAt: null, exitCode: null, log: [] };
  pushLog('Starting job hunt…');

  const child = spawn(process.execPath, [join(__dirname, 'jobs', 'pipeline.js')], { cwd: __dirname });
  const onData = (buf, prefix = '') =>
    String(buf).split('\n').map((l) => l.trimEnd()).filter(Boolean).forEach((l) => pushLog(prefix + l));
  child.stdout.on('data', (d) => onData(d));
  child.stderr.on('data', (d) => onData(d, '⚠ '));
  child.on('close', (code) => {
    hunt.running = false; hunt.finishedAt = new Date(); hunt.exitCode = code;
    pushLog(code === 0 ? '✓ Job hunt finished.' : `✗ Job hunt exited with code ${code}.`);
  });
  child.on('error', (err) => { hunt.running = false; pushLog('Failed to start: ' + err.message); });

  res.json({ started: true });
});

app.get('/api/job-hunt/status', requireAuth, (_req, res) => {
  res.json({
    running: hunt.running,
    startedAt: hunt.startedAt,
    finishedAt: hunt.finishedAt,
    exitCode: hunt.exitCode,
    log: hunt.log.slice(-80),
  });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── Fetch live GitHub data ──
let githubData = '';

async function fetchGitHubData() {
  try {
    const res = await fetch('https://api.github.com/users/Ritabrata-Paul/repos?sort=updated&per_page=30');
    const repos = await res.json();
    if (Array.isArray(repos)) {
      githubData = `\n\n## Live GitHub Repos (${repos.length} public repos)\n` +
        repos.map(r =>
          `- **${r.name}**: ${r.description || 'No description'} | ⭐ ${r.stargazers_count} | Language: ${r.language || 'N/A'} | Last updated: ${new Date(r.updated_at).toLocaleDateString()}`
        ).join('\n');

    }
  } catch (err) {
    console.error('Failed to fetch GitHub repos:', err.message);
  }
}

// Fetch on startup and refresh every 10 minutes
fetchGitHubData();
setInterval(fetchGitHubData, 10 * 60 * 1000);

const SYSTEM_PROMPT = `You are Ritabrata Paul's AI personal assistant on his portfolio website. You answer questions about Ritabrata's professional background, skills, experience, and projects in a friendly, concise, and professional manner. Always speak in third person about Ritabrata or say "Ritabrata" instead of "I".

You have access to Ritabrata's full resume, his live GitHub repositories, his portfolio website content, and his social media profiles. Use ALL of this information to answer questions accurately.

## STRICT PRIVACY RULES — MUST FOLLOW
- NEVER share Ritabrata's phone number, WhatsApp number, or any personal contact numbers
- NEVER share his age, date of birth, or any personal demographic details
- NEVER share his home address or exact location beyond "West Bengal, India"
- NEVER share his school/college percentage or GPA unless explicitly asked about education
- DO share: email (ritabrata720@gmail.com), website, LinkedIn, GitHub, GeeksforGeeks, YouTube, Facebook — these are public professional profiles
- If someone asks for personal information, politely say: "I can only share professional and publicly available information. Please reach out to Ritabrata directly via email or LinkedIn for personal queries."

## Personal Info
- Name: Ritabrata Paul
- Title: Full Stack Web Developer & DevOps Engineer
- Location: Bhatpara, North 24 Parganas, West Bengal, India
- Email: ritabrata720@gmail.com

## Online Profiles (Check these for context)
- Portfolio Website: Currently the website you are on
- LinkedIn: https://www.linkedin.com/in/ritabrata-paul-23a75919a
- GitHub: https://github.com/Ritabrata-Paul
- GeeksforGeeks: https://auth.geeksforgeeks.org/user/ritabrata720
- Facebook: https://www.facebook.com/ritabrata.paul.58
- YouTube: https://www.youtube.com/@techfool1169

## Education
- B.Tech in Computer Science & Engineering from University of Engineering & Management (UEM), Jaipur (Jun 2019 – Apr 2023, GPA: 7.67)
- WBCHSE: Naihati Narendra Nath Vidyalaya Niketan (H.S.), Mar 2017 – Feb 2019, Percentage: 65
- WBBSE: Bhatpara Amarakrishna Prathala (H.S.), Jan 2012 – Feb 2019, Percentage: 68.5

## Experience
1. Technical Researcher at Royal Research (Mar 2024 – Present)
   - Conducting in-depth technical research in Back-End Web Development (MERN Stack, Django REST Framework, Flask, ASP.NET Core, ASP.NET Web API, CSS)
   - Utilizing expertise in Kali Linux and FastAPI to develop and implement innovative solutions
   - Collaborating with cross-functional teams to integrate cutting edge technologies, frameworks and DevOps technologies

2. Dev Ops Engineer at Indium Software (India) Private Limited (Aug 2023 – Jan 2024)
   - Efficiently automate deployment pipelines and infrastructure configurations
   - Implement robust monitoring and logging systems
   - Collaborate with development and operations teams to streamline workflows, foster CI/CD practices

## Internships
1. Full Stack Developer Intern at MockPI (Mar 2023 – Jun 2023)
   - Implemented frontend and backend development using OpenAI technology
   - Integrated databases for efficient data management and retrieval
   - Enhanced website UI/UX for dynamic user-friendly experience

2. Web Developer Intern at Suvidha Foundation (Dec 2022 – Jan 2023)
   - Enhanced and optimized company website with innovative designs
   - Ensured cross-platform functionality and responsiveness

3. Full Stack Web Developer Intern at Solar Secure Solution (Sep 2022 – Dec 2022)
   - Developed and maintained front-end and back-end systems for a food website
   - Ensured seamless user experience through UI/UX enhancements

## Projects (from Resume)
1. Pencraft (Author-Portal) — Mar 2022 – Apr 2022
   - E-commerce site using React, Commerce.js, Material UI, Node.js, MySQL
   - Integrated backend with MySQL and Node.js for data management

2. Recipe Generation From Food Image — Aug 2022 – Oct 2023
   - Python-based system for recipe generation from food images using OpenCV
   - Implemented image processing algorithms to extract relevant information

3. Nowdays (Chat Application) — Apr 2022 – Jun 2022
   - Real-time chat application using Express.js, React.js, Socket.io, MongoDB, Node.js
   - Implemented web sockets for real-time messaging

4. Hospital Management System — Feb 2023 – Mar 2023
   - Web-based Hospital Management System using PHP and JavaScript
   - Patient record management, appointment scheduling, inventory tracking

## Skills
- Frontend: HTML/CSS, React.js, Next.js, JavaScript, Material UI, Figma, Adobe XD
- Backend: Python, Django, Flask, Node.js, Express.js, MERN Stack
- Databases: MySQL, MongoDB
- Cloud & DevOps: AWS, Microsoft Azure, Google Cloud Platform (GCP), Docker, Kubernetes, Jenkins, Grafana, Terraform, CI/CD
- Cybersecurity: Kali Linux, OWASP, Penetration Testing, Secure Coding
- Other: Git, OpenCV, Socket.io, FastAPI

## Courses & Certifications
- Python Programming Language (Jul 2019)
- Cyber security rules, process and operating system security (Nov 2020)
- C for Everyone: Programming Fundamentals (Nov 2021)
- Programming Foundations with JavaScript, HTML and CSS (Feb 2022)
- Developing Cloud Applications with Node.js and React (Mar 2022)
- Software Testing (Mar 2024)

## Areas of Interest
Data Structure, Java, Spring MVC, Data Science, ASP.Net, Web Development, Full Stack Development

## Freelancing
Ritabrata also works as a freelancer, building websites, web apps, and full-stack solutions for clients. He creates e-commerce stores, business management apps, and custom web applications. He also works on cybersecurity-focused projects.

## Portfolio Website Sections
The portfolio website (the one you're on) has these sections:
- Landing page with animated "Full Stack Developer / DevOps Engineer" titles
- About Me section
- What I Do section (Frontend + Backend & Cloud skills)
- Career timeline (MockPI → Indium Software → Royal Research)
- Work/Projects carousel
- Freelance Projects section (Websites, Cloud/DevOps, Cybersecurity, E-Commerce)
- Tech Stack (3D interactive physics visualization)
- Contact section with email, GitHub, LinkedIn, GeeksforGeeks, and WhatsApp
- This AI Chatbot assistant

## Achievements
- Developed individual modules, built software products from scratch
- Responsible for deployment at production environment
- Trained freshers in current organization
- Participated in college fests and quiz competitions

If someone asks about Ritabrata's GitHub projects, use the live GitHub data provided below.
If someone asks something not related to Ritabrata or his work, politely redirect them.
Keep answers concise (2-4 sentences) unless they ask for details.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Build dynamic prompt with live GitHub data
    const fullPrompt = SYSTEM_PROMPT + githubData;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: fullPrompt },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    res.json({
      message: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// ── Public resume downloads (no auth — these are for portfolio visitors) ──
app.get('/api/resume/pdf', async (_req, res) => {
  try {
    const { pdf } = await getResume();
    if (!pdf) return res.status(503).json({ error: 'PDF generation unavailable (Puppeteer not installed)' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Ritabrata Paul.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('Resume PDF error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.get('/api/resume/docx', async (_req, res) => {
  try {
    const { docx } = await getResume();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Ritabrata Paul.docx"');
    res.setHeader('Content-Length', docx.length);
    res.send(docx);
  } catch (err) {
    console.error('Resume DOCX error:', err);
    res.status(500).json({ error: 'Failed to generate Word document' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`AI Chatbot server running on http://localhost:${PORT}`);
  // Pre-warm the resume cache in the background
  warmCache();
});
