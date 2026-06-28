/** Domain types for the offline core (v0). */

/** How a todo repeats. `none` = one-off task. */
export type RecurrenceFreq =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Repeat every N units of `freq` (e.g. every 2 days). >= 1. */
  interval: number;
  /**
   * For weekly rules: which weekdays, 0=Sun … 6=Sat.
   * Empty => derive from the start date's weekday.
   */
  weekdays?: number[];
}

/** A reminder attached to a todo. Stored in v0; delivered server-side later. */
export type ReminderType = "one_shot" | "recurring";
export type ReminderChannel = "email" | "push";

export interface Reminder {
  id: string;
  type: ReminderType;
  channels: ReminderChannel[];
  /** one_shot: minutes before due (e.g. 60 = 1h before). */
  offsetMinutes?: number;
  /** recurring ("nag"): minutes before due that the window opens. */
  windowStartMinutes?: number;
  /** recurring: cadence in days between pings (1 = daily). */
  cadenceDays?: number;
  /** recurring: local time of day to fire, "HH:mm". */
  timeOfDay?: string;
  /** recurring: when the nag stops. */
  stop?: "on_complete" | "at_due";
}

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  /** Due date+time as epoch ms. Undefined => no date (a plain task). */
  dueAt?: number;
  recurrence: RecurrenceRule;
  reminders: Reminder[];
  /** Epoch ms when completed; undefined => open. */
  completedAt?: number;
  /** Manual ordering within a group (lower = higher). */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete tombstone (epoch ms) for future sync. */
  deletedAt?: number;
  /** AI-suggested + user-editable tags (e.g. "work", "finance"). */
  tags?: string[];
}

export const noRecurrence = (): RecurrenceRule => ({
  freq: "none",
  interval: 1,
});

// ─────────────────────────────────────────────────────────────────────────────
// Habits (§4.10) — recurring practices tracked for consistency over time.
// A habit is distinct from a todo: the value is the append-only log of each
// occurrence (streaks, completion rate), not one-off completion.
// ─────────────────────────────────────────────────────────────────────────────

/** How a habit's "expected" days are defined. */
export type HabitScheduleModel = "fixed_weekdays" | "flexible";
/** Period unit for a flexible (count-based) habit. */
export type HabitPeriod = "week" | "month";
/** Whether a habit tracks a numeric amount or just done/not-done. */
export type HabitMeasurement = "binary" | "measured";
/** A logged occurrence's state. "miss" is derived, never stored. */
export type HabitLogState = "done" | "skip";

export interface Habit {
  id: string;
  title: string;
  notes?: string;
  /** Emoji shown in the UI. */
  icon?: string;

  // Schedule — exactly one model.
  scheduleModel: HabitScheduleModel;
  /** fixed_weekdays: which days expected, 0=Sun … 6=Sat. */
  weekdays?: number[];
  /** flexible: the period the target is counted over. */
  period?: HabitPeriod;
  /** flexible: how many times per period (e.g. 5 = 5×/week). */
  targetCount?: number;

  // Measurement.
  measurement: HabitMeasurement;
  /** measured: unit label, e.g. "min", "reps". */
  unit?: string;
  /** measured: per-session target amount, e.g. 20. */
  targetAmount?: number;
  /** measured: only count a session "done" if amount >= targetAmount. */
  countDoneOnlyIfTarget?: boolean;

  // Alerting (reuses the cron + email/push pipeline).
  /** Local time of day to nudge, "HH:mm". Undefined => no scheduled nudge. */
  timeOfDay?: string;
  channels: ReminderChannel[];
  /** Send a follow-up nudge if not logged by end of the expected window. */
  escalate?: boolean;
  /** Warn when an active streak is about to break. */
  streakAtRisk?: boolean;

  tags?: string[];

  /** Manual ordering (lower = higher). */
  sortOrder: number;
  /** Hidden from daily view; history retained. */
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete tombstone for sync. */
  deletedAt?: number;
}

export interface HabitLog {
  id: string;
  habitId: string;
  /** Local calendar day, "YYYY-MM-DD". One log per habit per day. */
  date: string;
  state: HabitLogState;
  /** measured: amount logged for the session. */
  amount?: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete tombstone for sync. */
  deletedAt?: number;
}
