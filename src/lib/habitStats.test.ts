import { describe, it, expect } from "vitest";
import {
  indexLogs,
  dayStatus,
  currentStreak,
  longestStreak,
  completionRate,
  periodProgress,
  trend,
  isDueToday,
  countsAsDone,
} from "./habitStats";
import type { Habit, HabitLog, HabitLogState } from "./types";

// Reference "today" = Wednesday, 24 Jun 2026 (local). Week starts Sun 21 Jun.
const TODAY = new Date(2026, 5, 24);

let n = 0;
const log = (date: string, state: HabitLogState = "done", amount?: number): HabitLog => ({
  id: `l${n++}`,
  habitId: "h",
  date,
  state,
  amount,
  createdAt: 0,
  updatedAt: 1,
});

const dailyHabit = (over: Partial<Habit> = {}): Habit => ({
  id: "h",
  title: "Meditate",
  scheduleModel: "fixed_weekdays",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  measurement: "binary",
  channels: [],
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const mwfHabit = (over: Partial<Habit> = {}): Habit =>
  dailyHabit({ weekdays: [1, 3, 5], ...over }); // Mon/Wed/Fri

const flexHabit = (target: number, period: "week" | "month" = "week"): Habit =>
  dailyHabit({ scheduleModel: "flexible", weekdays: undefined, period, targetCount: target });

const idx = (logs: HabitLog[]) => indexLogs(logs);

describe("dayStatus", () => {
  const h = dailyHabit();
  it("classifies done / skip", () => {
    expect(dayStatus(h, "2026-06-24", idx([log("2026-06-24")]), TODAY)).toBe("done");
    expect(dayStatus(h, "2026-06-24", idx([log("2026-06-24", "skip")]), TODAY)).toBe("skip");
  });
  it("derives miss for a past expected day with no log", () => {
    expect(dayStatus(h, "2026-06-22", idx([]), TODAY)).toBe("miss");
  });
  it("gives today grace (none, not miss)", () => {
    expect(dayStatus(h, "2026-06-24", idx([]), TODAY)).toBe("none");
  });
  it("marks future days", () => {
    expect(dayStatus(h, "2026-06-25", idx([]), TODAY)).toBe("future");
  });
  it("marks off days for fixed-weekday habits", () => {
    // Tue 23 Jun is not in Mon/Wed/Fri
    expect(dayStatus(mwfHabit(), "2026-06-23", idx([]), TODAY)).toBe("off");
  });
  it("treats below-target measured logs as a miss in the past", () => {
    const h2 = dailyHabit({ measurement: "measured", targetAmount: 20, countDoneOnlyIfTarget: true });
    expect(dayStatus(h2, "2026-06-22", idx([log("2026-06-22", "done", 10)]), TODAY)).toBe("miss");
  });
});

describe("currentStreak — fixed weekdays", () => {
  it("counts consecutive completed days", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23"), log("2026-06-24")]);
    expect(currentStreak(dailyHabit(), logs, TODAY)).toBe(3);
  });
  it("breaks on a past miss", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-24")]); // 23 missing
    expect(currentStreak(dailyHabit(), logs, TODAY)).toBe(1);
  });
  it("gives today grace when not yet logged", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23")]); // today 24 not logged
    expect(currentStreak(dailyHabit(), logs, TODAY)).toBe(2);
  });
  it("treats skip as transparent", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23", "skip"), log("2026-06-24")]);
    expect(currentStreak(dailyHabit(), logs, TODAY)).toBe(2);
  });
  it("ignores off days (Mon/Wed/Fri)", () => {
    // expected back from Wed24: Wed24, Mon22, Fri19
    const logs = idx([log("2026-06-24"), log("2026-06-22"), log("2026-06-19")]);
    expect(currentStreak(mwfHabit(), logs, TODAY)).toBe(3);
  });
});

describe("currentStreak — flexible", () => {
  const h = flexHabit(3, "week"); // 3×/week
  it("counts satisfied periods, current period in grace", () => {
    const logs = idx([
      // current week (21–27): only 1 done → grace
      log("2026-06-22"),
      // prev week (14–20): 3 done → satisfied
      log("2026-06-15"),
      log("2026-06-17"),
      log("2026-06-19"),
    ]);
    expect(currentStreak(h, logs, TODAY)).toBe(1);
  });
  it("counts the current period once its target is met", () => {
    const logs = idx([
      log("2026-06-22"),
      log("2026-06-23"),
      log("2026-06-24"), // current week now has 3
      log("2026-06-15"),
      log("2026-06-17"),
      log("2026-06-19"), // prev week 3
    ]);
    expect(currentStreak(h, logs, TODAY)).toBe(2);
  });
});

describe("longestStreak", () => {
  it("finds the longest run across history (fixed daily)", () => {
    const logs = idx([
      log("2026-06-20"),
      log("2026-06-21"),
      log("2026-06-22"),
      // 23 missing
      log("2026-06-24"),
    ]);
    expect(longestStreak(dailyHabit(), logs, TODAY)).toBe(3);
  });
});

describe("completionRate — fixed daily, 7-day window", () => {
  it("is done / due, counting today only when logged", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23"), log("2026-06-24")]);
    // days 18–24 all expected; today logged → due = 7
    expect(completionRate(dailyHabit(), logs, 7, TODAY)).toBeCloseTo(3 / 7);
  });
  it("excludes today from due when not logged", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23")]);
    // due = 18–23 (6 days), done = 2
    expect(completionRate(dailyHabit(), logs, 7, TODAY)).toBeCloseTo(2 / 6);
  });
  it("excludes skip days from the denominator", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23", "skip"), log("2026-06-24")]);
    // due = 6 (23 excluded as rest), done = 2
    expect(completionRate(dailyHabit(), logs, 7, TODAY)).toBeCloseTo(2 / 6);
  });
});

describe("periodProgress", () => {
  it("reports flexible progress for the current period", () => {
    const logs = idx([log("2026-06-22"), log("2026-06-23")]);
    expect(periodProgress(flexHabit(3), logs, TODAY)).toMatchObject({
      done: 2,
      target: 3,
      met: false,
    });
  });
});

describe("trend", () => {
  it("reports improving when the last full period beat the one before", () => {
    const h = flexHabit(3, "week");
    const logs = idx([
      // last full week (14–20): 3 done
      log("2026-06-15"),
      log("2026-06-17"),
      log("2026-06-19"),
      // week before (7–13): 1 done
      log("2026-06-08"),
    ]);
    expect(trend(h, logs, TODAY)).toBe("improving");
  });
});

describe("isDueToday", () => {
  it("is true on an expected weekday", () => {
    expect(isDueToday(dailyHabit(), [], TODAY)).toBe(true);
  });
  it("is false once a flexible target is met", () => {
    const logs = [log("2026-06-22"), log("2026-06-23"), log("2026-06-24")];
    expect(isDueToday(flexHabit(3), logs, TODAY)).toBe(false);
  });
});

describe("countsAsDone", () => {
  it("respects countDoneOnlyIfTarget for measured habits", () => {
    const h = dailyHabit({ measurement: "measured", targetAmount: 20, countDoneOnlyIfTarget: true });
    expect(countsAsDone(h, log("2026-06-24", "done", 25))).toBe(true);
    expect(countsAsDone(h, log("2026-06-24", "done", 10))).toBe(false);
  });
});
