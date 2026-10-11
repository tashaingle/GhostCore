import {describe, expect, it} from "vitest";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {highlights, performanceMetrics} from "@/lib/home/performance";
import {explainHighlights} from "@/lib/home/why";

const now = new Date("2026-10-11T09:00:00Z"),
  DAY = 86_400_000;
let id = 0;
const event = (eventType: string, daysAgo: number, metadata: Record<string, unknown> = {}) =>
  ({
    id: `e${++id}`,
    source: eventType.split(".")[0],
    eventType,
    title: eventType,
    description: null,
    severity: "info",
    occurredAt: new Date(now.getTime() - daysAgo * DAY).toISOString(),
    metadata,
  }) satisfies IntelligenceEvent;
const date = (daysAgo: number) =>
  new Date(now.getTime() - daysAgo * DAY).toISOString().slice(0, 10);
/** Meta Ads spend for each of the last 14 days; `spend(daysAgo)` gives the amount. */
const metaAds = (spend: (daysAgo: number) => number) =>
  Array.from({length: 14}, (_, i) =>
    event("meta_ads.performance.daily_recorded", i + 1, {
      sourceEntityType: "account",
      sourceAccountId: "act_1",
      reportingDate: date(i + 1),
      currency: "GBP",
      metrics: {spend: spend(i + 1)},
    }),
  );
/** `before` orders spread over last week, `after` over this week. */
const orders = (before: number, after: number) => [
  ...Array.from({length: before}, (_, i) => event("shopify.order_created", 8 + (i % 6))),
  ...Array.from({length: after}, (_, i) => event("shopify.order_created", 1 + (i % 6))),
];
const searchWeeks = (before: number, after: number) => [
  event("google_search_console.performance_summary", 9, {clicks: before}),
  event("google_search_console.performance_summary", 2, {clicks: after}),
];
const visitsWeek = (before: number, after: number) => [
  event("analytics.performance_summary", 1, {
    propertyId: "p1",
    currentValue: after,
    previousValue: before,
    currentKeyEvents: 20,
    previousKeyEvents: 20,
  }),
];
const explain = (events: IntelligenceEvent[]) => {
  const metrics = performanceMetrics({events, counts: {}, period: "week", now});
  return explainHighlights({
    highlights: highlights(metrics, "week"),
    metrics,
    events,
    period: "week",
    now,
  }).filter((h) => h.tone === "bad");
};

describe("joining the dots when a figure falls", () => {
  it("names ads that stopped as the likely reason, and what was normal", () => {
    const [h] = explain([
      ...orders(20, 10),
      ...metaAds((d) => (d <= 4 ? 0 : 25)),
      ...searchWeeks(300, 295),
      ...visitsWeek(1000, 980),
    ]);
    expect(h.text).toMatch(/^Orders down 50%/);
    expect(h.why).toMatch(/^Your Meta ads stopped spending on \w+day \d+ Oct/);
    expect(h.why).toContain("about £25 a day");
    expect(h.why).toContain("while website visits and Google search were normal");
    expect(h.why).toMatch(/the Meta ads stopping is the most likely reason\.$/);
    expect(h.tip).toMatch(/Meta Ads Manager/);
    expect(h.action?.href).toContain("facebook.com");
  });

  it("says when nothing else changed, and points at the website when visitors held up", () => {
    const [h] = explain([
      ...orders(20, 10),
      ...metaAds(() => 25),
      ...searchWeeks(300, 300),
      ...visitsWeek(1000, 1000),
    ]);
    expect(h.why).toBe(
      "Nothing in your other tools changed at the same time: Meta ads, website visits and Google search were all normal.",
    );
    expect(h.tip).toMatch(/People still came to your website but fewer bought/);
  });

  it("treats Analytics going silent as a measuring problem", () => {
    const [h] = explain([
      ...visitsWeek(1000, 500),
      event("analytics.tracking_inactive", 2),
      ...metaAds(() => 25),
    ]);
    expect(h.text).toMatch(/^Website visits down 50%/);
    expect(h.why).toMatch(/^Google Analytics stopped recording visits altogether/);
    expect(h.tip).toMatch(/measuring problem/);
  });

  it("names both when two strong things changed at once", () => {
    const [h] = explain([
      ...orders(20, 10),
      ...metaAds((d) => (d <= 7 ? 15 : 25)),
      ...visitsWeek(1000, 600),
    ]);
    expect(h.why).toMatch(/^Two things changed at the same time: /);
    expect(h.why).toContain("Either could be the reason.");
  });

  it("stays quiet without other tools to compare", () => {
    const [h] = explain(orders(20, 10));
    expect(h.why).toBeUndefined();
  });

  it("never claims certainty", () => {
    const all = [
      explain([...orders(20, 10), ...metaAds((d) => (d <= 4 ? 0 : 25))]),
      explain([...visitsWeek(1000, 500), event("analytics.tracking_inactive", 2)]),
    ].flat();
    for (const h of all) expect(h.why).not.toMatch(/\bcaused\b|\bbecause\b/i);
  });
});
