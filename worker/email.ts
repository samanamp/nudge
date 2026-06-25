import type { Env } from "./index";

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send transactional email via Resend (free tier). Returns true on success.
 * Swappable: only this function knows the provider.
 */
export async function sendEmail(env: Env, mail: Mail): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    console.error("email send failed", res.status, await res.text());
    return false;
  }
  return true;
}

export function magicLinkEmail(link: string) {
  return {
    subject: "Your Nudge sign-in link",
    text: `Sign in to Nudge:\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;font-size:18px">Sign in to Nudge</h2>
        <p style="color:#555;font-size:14px;margin:0 0 20px">Tap the button to sign in. Expires in 15 minutes.</p>
        <a href="${link}" style="display:inline-block;background:#7c6cff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Sign in</a>
        <p style="color:#999;font-size:12px;margin:20px 0 0">If you didn't request this, ignore this email.</p>
      </div>`,
  };
}

export function reminderEmail(title: string, notes: string | undefined, dueAt?: number) {
  const when = dueAt ? new Date(dueAt).toLocaleString() : "";
  return {
    subject: `Reminder: ${title}`,
    text: `${title}${when ? `\nDue: ${when}` : ""}${notes ? `\n\n${notes}` : ""}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <p style="color:#999;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">Nudge reminder</p>
        <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(title)}</h2>
        ${when ? `<p style="color:#555;font-size:14px;margin:0 0 8px">Due ${when}</p>` : ""}
        ${notes ? `<p style="color:#555;font-size:14px;margin:0">${escapeHtml(notes)}</p>` : ""}
      </div>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
