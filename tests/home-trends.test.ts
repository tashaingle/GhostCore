import {describe, expect, it} from "vitest";
import {performanceMetrics} from "@/lib/home/performance";
import {formatTick, formatValue, linePath, niceMax} from "@/components/charts/format";

const now = new Date("2026-10-08T00:00:00Z");
const payment = (iso: string, amountMinor: number) => ({
  id: iso,
  source: "stripe",
  eventType: "stripe.payment_succeeded",
  occurredAt: iso,
  metadata: {amountMinor, currency: "gbp", mode: "live"},
});

describe("How you're doing trends", () => {
  it("adds daily revenue in pounds for this week and last", () => {
    const [revenue] = performanceMetrics({
      events: [
        payment("2026-10-01T10:00:00Z", 1000),
        payment("2026-10-01T15:00:00Z", 2550),
        payment("2026-10-07T09:00:00Z", 500),
        payment("2026-09-25T09:00:00Z", 4000),
      ] as never,
      counts: {},
      period: "week",
      now,
    });
    expect(revenue.trend?.unit).toEqual({kind: "money", currency: "gbp"});
    expect(revenue.trend?.current).toEqual([35.5, 0, 0, 0, 0, 0, 5]);
    expect(revenue.trend?.previous).toEqual(
      [0, 0, 0, 0, 0, 0, 0].map((v, i) => (i === 1 ? 40 : v)),
    );
    expect(revenue.trend?.starts[0]).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });

  it("groups a year into weeks", () => {
    const [revenue] = performanceMetrics({
      events: [payment("2026-10-07T09:00:00Z", 100)] as never,
      counts: {},
      period: "year",
      now,
    });
    expect(revenue.trend?.bucketDays).toBe(7);
    expect(revenue.trend?.current).toHaveLength(53);
  });

  it("carries subscriber totals forward between daily readings", () => {
    const snap = (day: string, audienceId: string, subscribers: number) => ({
      id: day + audienceId,
      source: "mailchimp",
      eventType: "mailchimp.audience.daily_recorded",
      occurredAt: `${day}T23:59:59.000Z`,
      metadata: {audienceId, subscribers},
    });
    const metric = performanceMetrics({
      events: [
        snap("2026-10-02", "A", 100),
        snap("2026-10-02", "B", 20),
        snap("2026-10-05", "A", 130),
      ] as never,
      counts: {},
      period: "week",
      now,
    }).find((m) => m.key === "emailSubscribers");
    expect(metric?.trend?.current).toEqual([null, 120, 120, 120, 130, 130, 130]);
  });
});

describe("chart formatting", () => {
  it("rounds axes to clean numbers and formats values", () => {
    expect(niceMax(37)).toBe(50);
    expect(niceMax(1200)).toBe(2000);
    expect(niceMax(0)).toBe(1);
    expect(formatValue(1234.5, {kind: "money", currency: "gbp"})).toBe("£1,235");
    expect(formatValue(35.5, {kind: "money", currency: "gbp"})).toBe("£35.50");
    expect(formatTick(2500, {kind: "count"})).toBe("2.5K");
    expect(formatTick(1200, {kind: "money", currency: "gbp"})).toBe("£1.2K");
  });

  it("breaks lines where there's no data", () => {
    expect(
      linePath(
        [1, null, 3],
        (i) => i,
        (v) => v,
      ),
    ).toBe("M0.0,1.0M2.0,3.0");
  });
});
