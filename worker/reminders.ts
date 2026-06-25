import type { Env } from "./index";
import { reminderEmail, sendEmail } from "./email";
import { sendWebPush } from "./webpush";

const DAY_MS = 86_400_000;

interface DueRow {
  id: string;
  todo_id: string;
  user_id: string;
  type: string;
  channels: string;
  title: string;
  notes: string | null;
  due_at: number | null;
  cadence_days: number | null;
  stop: string | null;
  next_fire_at: number;
  completed_at: number | null;
  deleted_at: number | null;
  email: string;
}

/**
 * Cron entrypoint: fire every reminder whose time has come. One-shots close
 * after firing; recurring "nags" roll forward by their cadence until the task
 * is done (or the due date passes, for `at_due`).
 */
export async function runDueReminders(env: Env, now = Date.now()): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT r.id, r.todo_id, r.user_id, r.type, r.channels, r.title, r.notes,
            r.due_at, r.cadence_days, r.stop, r.next_fire_at,
            t.completed_at, t.deleted_at, u.email
       FROM reminders r
       JOIN todos t ON t.id = r.todo_id
       JOIN users u ON u.id = r.user_id
      WHERE r.status = 'scheduled' AND r.next_fire_at <= ?
      LIMIT 200`,
  )
    .bind(now)
    .all<DueRow>();

  let fired = 0;
  for (const r of due.results ?? []) {
    // Cancelled by completion/deletion — close without sending.
    if (r.deleted_at != null || r.completed_at != null) {
      await markDone(env, r.id);
      continue;
    }

    const channels: string[] = safeParse(r.channels);

    if (channels.includes("email")) {
      const ok = await sendEmail(env, {
        to: r.email,
        ...reminderEmail(r.title, r.notes ?? undefined, r.due_at ?? undefined),
      });
      if (ok) fired++;
    }

    if (channels.includes("push") && env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY) {
      const subs = await env.DB.prepare(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
      )
        .bind(r.user_id)
        .all<{ endpoint: string; p256dh: string; auth: string }>();

      const dueStr = r.due_at ? new Date(r.due_at).toLocaleDateString() : undefined;
      const body = dueStr ? `Due ${dueStr}` : (r.notes ?? "Reminder");

      await Promise.all(
        (subs.results ?? []).map((sub) =>
          sendWebPush(
            sub,
            { title: r.title, body, tag: r.id },
            env.VAPID_PRIVATE_KEY!,
            env.VAPID_PUBLIC_KEY!,
          ),
        ),
      );
    }

    const next = advance(r, now);
    if (next == null) {
      await markDone(env, r.id);
    } else {
      await env.DB.prepare(
        "UPDATE reminders SET next_fire_at = ?, last_fired_at = ? WHERE id = ?",
      )
        .bind(next, now, r.id)
        .run();
    }
  }
  return fired;
}

/** Next fire time for a recurring nag, or null to close the reminder. */
function advance(r: DueRow, now: number): number | null {
  if (r.type !== "recurring" || !r.cadence_days) return null;
  const next = r.next_fire_at + Math.max(1, r.cadence_days) * DAY_MS;
  if (next <= now) return now + Math.max(1, r.cadence_days) * DAY_MS; // catch up
  if (r.stop === "at_due" && r.due_at != null && next >= r.due_at) return null;
  return next;
}

async function markDone(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE reminders SET status = 'done' WHERE id = ?")
    .bind(id)
    .run();
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
