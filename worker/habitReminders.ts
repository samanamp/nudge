import type { Env } from "./index";
import { sendEmail } from "./email";
import { sendWebPush } from "./webpush";

/**
 * Habit nudges (§4.10.5). The 5-min cron evaluates each active habit against
 * the user's local clock: if it's at/after the habit's reminder time on an
 * expected day and the user hasn't logged it yet, fire once. The `habit_fires`
 * table (PRIMARY KEY `${habit}:${date}:${kind}`) makes the fire idempotent
 * across cron runs, so no per-occurrence schedule rows are needed.
 *
 * Timezone-correct without server tz math: we derive the user's local date /
 * time / weekday via Intl using their stored IANA timezone.
 */

interface HabitRow {
  id: string;
  data: string;
  user_id: string;
  email: string;
  timezone: string | null;
}

interface HabitData {
  title: string;
  icon?: string;
  timeOfDay?: string;
  channels?: string[];
  scheduleModel?: "fixed_weekdays" | "flexible";
  weekdays?: number[];
  period?: "week" | "month";
  targetCount?: number;
}

export async function runDueHabitNudges(env: Env, now = Date.now()): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT h.id, h.data, h.user_id, u.email, u.timezone
       FROM habits h JOIN users u ON u.id = h.user_id
      WHERE h.deleted_at IS NULL AND h.archived_at IS NULL`,
  ).all<HabitRow>();

  let fired = 0;
  for (const r of rows.results ?? []) {
    let h: HabitData;
    try {
      h = JSON.parse(r.data);
    } catch {
      continue;
    }
    if (!h.timeOfDay || !h.channels?.length) continue;

    const { date, hhmm, weekday } = localParts(r.timezone ?? "UTC", now);
    if (hhmm < h.timeOfDay) continue; // not yet today

    // Expected today?
    if ((h.scheduleModel ?? "fixed_weekdays") === "fixed_weekdays") {
      const wd = h.weekdays && h.weekdays.length ? h.weekdays : [0, 1, 2, 3, 4, 5, 6];
      if (!wd.includes(weekday)) continue;
    }

    // Already acted today (done or intentional skip)? Then don't nudge.
    const todayLogs = await env.DB.prepare(
      "SELECT data FROM habit_logs WHERE habit_id = ? AND date = ? AND deleted_at IS NULL",
    )
      .bind(r.id, date)
      .all<{ data: string }>();
    if ((todayLogs.results ?? []).some((l) => logState(l.data) !== null)) continue;

    // Flexible: stop once the period target is met.
    if ((h.scheduleModel ?? "fixed_weekdays") === "flexible") {
      const target = Math.max(1, h.targetCount ?? 1);
      const start = periodStartKey(date, h.period ?? "week", weekday);
      const done = await countDone(env, r.id, start, date);
      if (done >= target) continue;
    }

    // Idempotent fire marker — skip if we already nudged today.
    const fireId = `${r.id}:${date}:nudge`;
    const ins = await env.DB.prepare(
      "INSERT OR IGNORE INTO habit_fires (id, habit_id, user_id, date, kind, fired_at) VALUES (?, ?, ?, ?, 'nudge', ?)",
    )
      .bind(fireId, r.id, r.user_id, date, now)
      .run();
    if (!ins.meta.changes) continue; // already fired today

    await deliver(env, r, h);
    fired++;
  }
  return fired;
}

async function deliver(env: Env, r: HabitRow, h: HabitData): Promise<void> {
  const channels = h.channels ?? [];
  const label = `${h.icon ? `${h.icon} ` : ""}${h.title}`;

  if (channels.includes("email")) {
    await sendEmail(env, {
      to: r.email,
      subject: `Time for ${h.title}`,
      text: `Don't forget to ${h.title} today. Open Nudge to log it.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <p style="color:#999;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">Habit reminder</p>
        <h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(label)}</h2>
        <p style="color:#555;font-size:14px;margin:0">Keep your streak going — log today in Nudge.</p>
      </div>`,
    }).catch((e) => console.error("habit email error:", e));
  }

  if (channels.includes("push") && env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY) {
    const subs = await env.DB.prepare(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    )
      .bind(r.user_id)
      .all<{ endpoint: string; p256dh: string; auth: string }>();
    await Promise.all(
      (subs.results ?? []).map((sub) =>
        sendWebPush(
          sub,
          { title: `Time for ${h.title}`, body: "Tap to log today", tag: r.id },
          env.VAPID_PRIVATE_KEY!,
          env.VAPID_PUBLIC_KEY!,
        ).catch((e) => console.error("habit push error:", e)),
      ),
    );
  }
}

async function countDone(env: Env, habitId: string, start: string, end: string): Promise<number> {
  const rows = await env.DB.prepare(
    "SELECT data FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL",
  )
    .bind(habitId, start, end)
    .all<{ data: string }>();
  return (rows.results ?? []).filter((l) => logState(l.data) === "done").length;
}

function logState(data: string): "done" | "skip" | null {
  try {
    const s = JSON.parse(data)?.state;
    return s === "done" || s === "skip" ? s : null;
  } catch {
    return null;
  }
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local date "YYYY-MM-DD", time "HH:mm", and weekday (0=Sun) for a timezone. */
function localParts(tz: string, now: number): { date: string; hhmm: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, hhmm: `${hour}:${get("minute")}`, weekday: WD[get("weekday")] ?? 0 };
}

/** Start-of-period key: Sunday of the week, or the 1st of the month. */
function periodStartKey(date: string, period: "week" | "month", weekday: number): string {
  if (period === "month") return `${date.slice(0, 7)}-01`;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - weekday);
  return dt.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
