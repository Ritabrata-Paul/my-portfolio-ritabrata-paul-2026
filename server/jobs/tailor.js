// CV tailoring via Claude. Calls the Anthropic Messages API with plain fetch
// (using ANTHROPIC_API_URL / ANTHROPIC_VERSION from .env) so no SDK install is
// needed. Rewrites the resume to surface genuine matches for a specific job —
// it must NOT invent skills or experience the candidate doesn't have.

const DEFAULT_MODEL = 'claude-sonnet-5';

function buildPrompt(resume, job, matchReport) {
  return `You are an expert technical resume writer and ATS optimization specialist. Your goal is to produce a resume that scores 90%+ on ATS keyword matching while remaining 100% truthful.

## ABSOLUTE RULES
1. ONLY use skills, tools, and experience the candidate genuinely has (present in the resume JSON below).
2. You MAY reorder, rephrase, emphasize, and mirror the EXACT language from the job posting.
3. You MAY move genuinely-relevant skills/keywords earlier and drop irrelevant ones.
4. You MUST NOT add a skill or claim the candidate does not already have.
5. NEVER use emojis, special Unicode characters, or decorative symbols anywhere in any output. Use only plain ASCII text.
6. Use professional, formal language throughout. No casual tone.
7. Mirror the job description's exact terminology (e.g., if the job says "CI/CD pipelines", use that exact phrase, not "continuous integration").
8. Every bullet point MUST start with a strong action verb (Developed, Implemented, Architected, Automated, Deployed, etc.).
9. Include measurable outcomes where plausible (e.g., "Reduced deployment time", "Improved response time").

## COMPANY-SPECIFIC TAILORING
Company: ${job.company}
Research what you know about ${job.company}'s tech stack, values, culture, and engineering practices. Tailor the summary and highlights to align with what this specific company values. Reference their domain or industry where relevant.

## CANDIDATE RESUME (JSON, source of truth)
${JSON.stringify(resume, null, 2)}

## TARGET JOB
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description:
${job.description.slice(0, 5000)}

## KEYWORD MATCH REPORT (pre-tailoring)
Already matched: ${matchReport.matched.join(', ') || '(none)'}
Job keywords the candidate is MISSING: ${matchReport.missing.join(', ') || '(none)'}
For missing keywords: ONLY incorporate them if the candidate TRULY has that skill somewhere in the resume. Otherwise leave them out and list them honestly in missingSkills.

## ATS OPTIMIZATION STRATEGY
- The ATS score is calculated as: (job keywords found in resume / total job keywords) * 100.
- To hit 90%+, you MUST incorporate as many of the "already matched" keywords as possible into the summary, highlights, and skills.
- Rephrase bullet points to naturally include the job's exact terminology.
- Place the most relevant skills first in skillsOrder.
- Use the job title's exact wording in the summary where the candidate's background supports it.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences, no comments, no emojis). Exact shape:
{
  "summary": "3-4 sentence professional summary tailored to this specific job and company, using the job's exact keywords that the candidate genuinely matches. No emojis.",
  "highlights": ["8-12 resume bullet points. Most job-relevant first. Each starts with a strong action verb. Reflect real experience only. Mirror job description language. No emojis."],
  "skillsOrder": ["flat list of ALL the candidate's real skills from the resume, ordered strictly by relevance to this job. Most relevant first."],
  "coverLetter": "A professional 150-200 word cover letter in plain text. Address it to the hiring team at ${job.company}. Reference the specific role and why the candidate is a strong fit. No emojis, no special characters.",
  "incorporatedKeywords": ["every job keyword you legitimately worked into the resume because the candidate genuinely has them"],
  "matchReason": ["5-8 short bullet strings explaining WHY the candidate fits, e.g. 'MERN Stack - built 3 production apps', 'CI/CD pipelines - implemented at Indium Software'. Each must be a genuine, specific match."],
  "missingSkills": ["job requirements the candidate does NOT have or has only lightly. Be completely honest - do not hide gaps."],
  "interviewQuestions": ["6-8 likely technical and behavioral interview questions for THIS specific role that the candidate should prepare for"]
}`;
}

export async function tailorResume(resume, job, matchReport) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const apiUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
  const version = process.env.ANTHROPIC_VERSION || '2023-06-01';
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': version,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: 'user', content: buildPrompt(resume, job, matchReport) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  // claude-sonnet-5 may return a `thinking` block first; grab the text block.
  const raw = (data.content?.find((c) => c.type === 'text')?.text || '').trim();
  // Remove any ```json ... ``` fences, then parse. Fall back to extracting the
  // outermost { ... } if Claude added surrounding prose.
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
    }
    if (data.stop_reason === 'max_tokens') {
      throw new Error('Claude response was truncated — raise max_tokens.');
    }
    throw new Error('Could not parse Claude tailoring response as JSON: ' + e.message);
  }
}
