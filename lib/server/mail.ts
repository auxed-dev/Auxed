/**
 * Transactional email. Uses Resend when RESEND_API_KEY is set; otherwise prints the message to the
 * server log so links can be followed during development.
 */
export async function sendMail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? 'Auxed <no-reply@auxed.app>';
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[mail] RESEND_API_KEY not set; email "${msg.subject}" to ${msg.to} was not sent.`);
    } else {
      console.log(`\n[mail] To: ${msg.to}\n[mail] Subject: ${msg.subject}\n${msg.text}\n`);
    }
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) console.error('[mail] Resend error', res.status, await res.text().catch(() => ''));
}

export function emailLayout(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#2B3FB0;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;letter-spacing:.06em">${cta.label}</a></p>`
    : '';
  return `<div style="background:#000;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#fff">
  <h1 style="font-size:22px;letter-spacing:.08em;margin:0 0 16px">AUXED</h1>
  <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
  <p style="color:#c9cff5;line-height:1.5">${body}</p>${button}
  <p style="color:#6b74a8;font-size:12px">Power to the music lovers.</p></div>`;
}
