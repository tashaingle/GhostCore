import {describe, expect, it} from "vitest";
import {googleAdsReturnDeclineRule} from "@/lib/intelligence/rules/advertising/google-ads-return-decline";
import {metaReturnDeclineRule} from "@/lib/intelligence/rules/advertising/meta-return-decline";
import {adSpendUpOrdersDownRule} from "@/lib/intelligence/rules/cross-provider/ad-spend-up-orders-down";
import type {IntelligenceEvent} from "@/lib/intelligence/types";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ctx = {now: NOW};
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
let seq = 0;
const ev = (eventType: string, occurredAt: string, metadata: Record<string, unknown>) =>
  ({
    id: `e${++seq}`,
    source: eventType.split(".")[0],
    eventType,
    title: eventType,
    description: null,
    severity: "info",
    occurredAt,
    recordedAt: NOW.toISOString(),
    metadata,
  }) as IntelligenceEvent;

/** One Google Ads account-day, `ago` days back. */
const adsDay = (ago: number, spend: number, conversions: number, value: number) =>
  ev("google_ads.performance.daily_recorded", `${daysAgo(ago).slice(0, 10)}T12:00:00.000Z`, {
    sourceAccountId: "1234567890",
    reportingDate: daysAgo(ago).slice(0, 10),
    currency: "GBP",
    metrics: {spend, spendMicros: String(spend * 1_000_000), conversions, conversionsValue: value},
  });
const weeks = (before: [number, number, number], after: [number, number, number]) => [
  ...[8, 9, 10, 11, 12, 13, 14].map((d) => adsDay(d, ...before)),
  ...[1, 2, 3, 4, 5, 6, 7].map((d) => adsDay(d, ...after)),
];
const orders = (count: number, from: number, to: number) =>
  Array.from({length: count}, (_, i) =>
    ev("shopify.order_created", daysAgo(from - ((from - to) * i) / count), {
      shop: "acme.myshopify.com",
      orderId: `o${++seq}`,
    }),
  );

describe("Google Ads in the ad warnings", () => {
  it("flags Google Ads conversion value falling while spend held", () => {
    const [insight] = googleAdsReturnDeclineRule.evaluate(weeks([50, 3, 300], [50, 1, 100]), ctx);
    expect(insight.title).toBe("Google Ads conversion value down 66.7% while spend held");
    expect(insight.summary).toContain("Google Ads reported £700.00 in conversion value");
    expect(insight.explanation).toContain("Google's own conversion figures");
    expect(googleAdsReturnDeclineRule.id.startsWith("advertising.")).toBe(true);
    // Meta's rule ignores Google Ads days.
    expect(metaReturnDeclineRule.evaluate(weeks([50, 3, 300], [50, 1, 100]), ctx)).toEqual([]);
  });

  it("stays quiet when value holds", () => {
    expect(googleAdsReturnDeclineRule.evaluate(weeks([50, 3, 300], [50, 3, 290]), ctx)).toEqual([]);
  });

  it("counts Google Ads spend when spend rises while orders fall", () => {
    const events = [
      ...weeks([20, 0, 0], [40, 0, 0]),
      ...orders(1, 20, 19),
      ...orders(20, 14, 7.1),
      ...orders(8, 7, 0.1),
    ];
    const [insight] = adSpendUpOrdersDownRule.evaluate(events, ctx);
    expect(insight.title).toBe("Ad spend up 100% while Shopify orders fell 60%");
    expect(insight.summary).toContain("Google Ads spend rose");
    expect(insight.metadata?.platforms).toBe("Google Ads");
  });
});
