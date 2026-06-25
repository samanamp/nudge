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
