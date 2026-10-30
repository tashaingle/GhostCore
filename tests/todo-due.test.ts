import {describe, expect, it} from "vitest";
import {dayFromDueAt, dueAtFromDay, dueLabel, todayKey} from "@/lib/home/todo";

describe("to-do deadlines", () => {
  it("round-trips a calendar day", () => {
    expect(dayFromDueAt(dueAtFromDay("2026-11-06"))).toBe("2026-11-06");
    expect(dayFromDueAt(null)).toBe("");
  });

  it("uses the UK date for today", () => {
    expect(todayKey(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-30");
    expect(todayKey(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  it("labels deadlines relative to today", () => {
    const today = "2026-10-30";
    expect(dueLabel(dueAtFromDay("2026-10-28"), "open", today)).toEqual({
      text: "Overdue · Wed 28 Oct",
      tone: "overdue",
    });
    expect(dueLabel(dueAtFromDay("2026-10-30"), "open", today).text).toBe("Due today");
    expect(dueLabel(dueAtFromDay("2026-10-31"), "in_progress", today).text).toBe("Due tomorrow");
    expect(dueLabel(dueAtFromDay("2026-12-01"), "open", today)).toEqual({
      text: "Due 1 Dec",
      tone: "later",
    });
    expect(dueLabel(dueAtFromDay("2026-10-28"), "completed", today).tone).toBe("done");
  });
});
