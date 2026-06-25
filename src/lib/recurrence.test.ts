import { describe, it, expect } from "vitest";
import { nextOccurrence, describeRecurrence } from "./recurrence";
import type { RecurrenceRule } from "./types";

const at = (s: string) => new Date(s).getTime();
const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

describe("nextOccurrence", () => {
  it("returns null for one-off todos", () => {
    expect(nextOccurrence(at("2026-01-01T09:00"), { freq: "none", interval: 1 })).toBe(
      null,
    );
  });

  it("steps daily and keeps the time of day", () => {
    const next = nextOccurrence(at("2026-01-01T09:00"), {
      freq: "daily",
      interval: 1,
    });
    expect(iso(next)).toBe(iso(at("2026-01-02T09:00")));
  });

  it("supports every-other-day", () => {
    const next = nextOccurrence(at("2026-01-01T09:00"), {
      freq: "daily",
      interval: 2,
    });
    expect(iso(next)).toBe(iso(at("2026-01-03T09:00")));
  });

  it("advances monthly by interval", () => {
    const next = nextOccurrence(at("2026-01-15T08:00"), {
      freq: "monthly",
      interval: 1,
    });
    expect(iso(next)).toBe(iso(at("2026-02-15T08:00")));
  });

  it("picks the next selected weekday (Mon/Wed/Fri)", () => {
    // 2026-01-05 is a Monday.
    const rule: RecurrenceRule = {
      freq: "weekly",
      interval: 1,
      weekdays: [1, 3, 5],
    };
    const next = nextOccurrence(at("2026-01-05T09:00"), rule);
    expect(iso(next)).toBe(iso(at("2026-01-07T09:00"))); // Wednesday
  });
});

describe("describeRecurrence", () => {
  it("describes simple and N-interval rules", () => {
    expect(describeRecurrence({ freq: "none", interval: 1 })).toBe("");
    expect(describeRecurrence({ freq: "daily", interval: 1 })).toBe("Every day");
    expect(describeRecurrence({ freq: "daily", interval: 2 })).toBe("Every 2 days");
  });
});
