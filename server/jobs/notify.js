// Optional email notification. Only active if SMTP_USER + SMTP_PASS are set
// AND nodemailer is installed. Otherwise a no-op (results still saved to disk).

export async function sendEmail(subject, html, attachments = []) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_TO || user;
  if (!user || !pass) {
    console.log('  (email skipped — SMTP_USER/SMTP_PASS not set)');
    return false;
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transport.sendMail({ from: user, to, subject, html, attachments });
    console.log(`  Email sent to ${to}`);
    return true;
  } catch (err) {
    console.warn(`  (email failed: ${err.message.split('\n')[0]})`);
    return false;
  }
}
