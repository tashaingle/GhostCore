import {describe, expect, it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {
  insightActionCategory,
  insightNeedsAction,
  insightNotificationRules,
} from "@/lib/notifications/insight-rules";
import {notificationCategories} from "@/lib/notifications/types";
import {notificationRuleRegistry} from "@/lib/notifications/rules";
import {humanCategory} from "@/lib/ui/labels";
import {performanceMetrics} from "@/lib/home/performance";
import {formatTick, formatValue} from "@/components/charts/format";
import type {IntelligenceEvent} from "@/lib/intelligence/types";

describe("review alerts in the Action Centre", () => {
  it("files review insights under Customers and money insights under Money", () => {
    expect(insightActionCategory({rule_id: "reviews.low_rating", severity: "warning"})).toBe(
      "customer",
    );
    expect(insightActionCategory({rule_id: "reviews.rating_drop", severity: "critical"})).toBe(
      "customer",
    );
    expect(
      insightActionCategory({
        rule_id: "advertising.google_ads_return_decline",
        severity: "warning",
      }),
    ).toBe("financial");
    expect(insightNeedsAction({rule_id: "reviews.low_rating", severity: "info"})).toBe(false);
    expect(notificationCategories).toContain("customer");
    expect(humanCategory("customer")).toBe("Customers");
    expect(notificationRuleRegistry.map((r) => r.key)).toContain("review_needs_attention");
  });

  it("each rule only creates items for its own category", async () => {
    const row = (id: string, rule_id: string) => ({
      id,
      title: id,
      summary: `Summary ${id}`,
      explanation: "why",
      recommendation: `Do ${id}`,
      severity: "warning",
      confidence: 90,
      rule_id,
      updated_at: "2026-10-02T12:00:00Z",
    });
    const client = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: async () => ({
            data: [
              row("money", "payments.stripe_failure_rate"),
              row("review", "reviews.low_rating"),
            ],
          }),
        };
        return chain;
      },
    } as unknown as SupabaseClient<Database>;
    const run = (key: string) =>
      insightNotificationRules
        .find((r) => r.key === key)!
        .evaluate({client, organisationId: "org", now: new Date(), limit: 50, configuration: {}});
    expect((await run("insight_requires_action")).map((i) => [i.sourceId, i.category])).toEqual([
      ["money", "financial"],
    ]);
    const [review] = await run("review_needs_attention");
    expect(review).toMatchObject({
      sourceId: "review",
      category: "customer",
      recommendedAction: "Do review",
      fingerprintParts: ["org", "review_needs_attention", "1", "insight", "review"],
    });
  });
});

describe("app rating on the home page", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  let n = 0;
  const review = (source: string, stars: number, daysAgo: number): IntelligenceEvent => ({
    id: `r${++n}`,
    source,
    eventType: `${source}.review.received`,
    title: "review",
    description: null,
    severity: "info",
    occurredAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    metadata: {starRating: stars},
  });

  it("averages new reviews across stores and compares with the period before", () => {
    const metrics = performanceMetrics({
      events: [
        review("google_play", 5, 1),
        review("app_store", 4, 2),
        review("google_play", 3, 3),
        review("google_play", 5, 8),
        review("app_store", 5, 9),
        review("google_play", 5, 10),
      ],
      counts: {},
      period: "week",
      now,
    });
    const rating = metrics.find((m) => m.key === "appRating")!;
    expect(rating).toMatchObject({
      group: "Customers",
      value: "4.0★",
      change: -20,
      source: "New reviews · Google Play + App Store",
      higherIsBetter: true,
      comparable: true,
    });
    expect(rating.trend?.unit).toEqual({kind: "rating"});
    expect(rating.trend?.current.filter((v) => v !== null)).toEqual([3, 4, 5]);
    expect(formatValue(4.25, {kind: "rating"})).toBe("4.3★");
    expect(formatTick(4, {kind: "rating"})).toBe("4.0");
  });

  it("is left out when there are no new reviews this period", () => {
    const metrics = performanceMetrics({
      events: [review("google_play", 5, 10)],
      counts: {},
      period: "week",
      now,
    });
    expect(metrics.find((m) => m.key === "appRating")).toBeUndefined();
  });
});
