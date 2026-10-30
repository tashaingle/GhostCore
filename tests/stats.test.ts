import {describe, expect, it} from "vitest";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {statsSections} from "@/lib/stats/stats";

const now = new Date("2026-10-30T18:00:00Z");
let id = 0;
const event = (eventType: string, occurredAt: string, metadata: Record<string, unknown>) =>
  ({
    id: String(++id),
    source: "test",
    eventType,
    title: eventType,
    description: null,
    severity: "info",
    occurredAt,
    recordedAt: occurredAt,
    metadata,
  }) as IntelligenceEvent;

const page = (date: string, followers: number, reach: number) =>
  event("meta_social.facebook.performance.daily_recorded", `${date}T12:00:00Z`, {
    sourceEntityId: "page-1",
    metrics: {followers, page_total_media_view_unique: reach},
  });
const visits = (date: string, property: string, value: number, channels = {}) =>
  event("analytics.performance_summary", `${date}T06:59:59Z`, {
    metric: "sessions",
    propertyId: property,
    currentValue: value,
    currentChannels: channels,
  });

describe("stats page figures", () => {
  it("adds up Facebook reach and keeps the latest follower count", () => {
    const sections = statsSections({
      events: [
        page("2026-10-20", 900, 50),
        page("2026-10-25", 1000, 100),
        page("2026-10-29", 1025, 223),
      ],
      period: "week",
      now,
    });
    const social = sections.find((s) => s.key === "social")!;
    const followers = social.charts.find((c) => c.key === "followers")!;
    const reach = social.charts.find((c) => c.key === "reach")!;
    expect(followers.value).toBe(1025);
    expect(followers.change).toBeCloseTo(13.9, 1);
    expect(reach.value).toBe(323);
    expect(reach.change).toBe(546);
  });

  it("totals website visits across properties, newest reading per day, with sources", () => {
    const sections = statsSections({
      events: [
        visits("2026-10-29", "a", 900, {Direct: 600, "Organic Search": 300}),
        visits("2026-10-29", "b", 153, {Direct: 150, "Organic Social": 3}),
        visits("2026-10-22", "a", 100),
      ],
      period: "week",
      now,
    });
    const website = sections.find((s) => s.key === "website")!;
    expect(website.charts.find((c) => c.key === "visits")!.value).toBe(1053);
    expect(website.sources).toEqual([
      {label: "Direct", value: 750},
      {label: "Organic Search", value: 300},
      {label: "Organic Social", value: 3},
    ]);
  });

  it("leaves out areas with no data", () => {
    expect(statsSections({events: [], period: "month", now})).toEqual([]);
  });
});
