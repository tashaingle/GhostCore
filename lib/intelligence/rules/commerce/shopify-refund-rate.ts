import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceRule} from "../../types";
import {
  comparisonWindows,
  contextNow,
  groupBy,
  isoWeek,
  metadataString,
  within,
} from "../../windows";

export const shopifyRefundRateRule: IntelligenceRule = {
  id: "commerce.shopify_refund_rate",
  name: "High Shopify refund rate",
  description: "Flags when an unusually high share of recent Shopify orders has been refunded.",
  priority: 42,
  supportedProviders: ["shopify"],
  evaluate(events, context) {
    const now = contextNow(context),
      {currentStart, end} = comparisonWindows(now, C.refundWindowDays),
      byShop = groupBy(
        events.filter(
          (e) =>
            e.eventType === "shopify.order_created" || e.eventType === "shopify.order_refunded",
        ),
        (e) => metadataString(e.metadata, "shop"),
      );
    return [...byShop].flatMap(([shop, shopEvents]) => {
      // An order can emit several refund events as it changes; count each order once.
      const placed = new Map(
          shopEvents
            .filter((e) => e.eventType === "shopify.order_created" && within(e, currentStart, end))
            .flatMap((e) => {
              const id = metadataString(e.metadata, "orderId");
              return id ? [[id, e] as const] : [];
            }),
        ),
        refunded = new Map(
          shopEvents
            .filter((e) => e.eventType === "shopify.order_refunded")
            .flatMap((e) => {
              const id = metadataString(e.metadata, "orderId");
              return id && placed.has(id) ? [[id, e] as const] : [];
            }),
        ),
        rate = placed.size ? Math.round((refunded.size / placed.size) * 1000) / 10 : 0;
      if (refunded.size < C.minimumRefunds || rate < C.refundRatePercent) return [];
      return [
        {
          title: `${rate}% of recent Shopify orders refunded`,
          summary: `${refunded.size} of ${placed.size} orders placed at ${shop} in the last ${C.refundWindowDays} days have been refunded.`,
          severity: "warning" as const,
          confidence: Math.min(90, 68 + refunded.size * 2),
          explanation: `${refunded.size} refunded orders out of ${placed.size} placed in the last ${C.refundWindowDays} days is above the ${C.refundRatePercent}% threshold.`,
          recommendation:
            "Look for a common product, variant, supplier or fulfilment issue behind the refunds, and check product descriptions and sizing information.",
          sourceEventIds: [...refunded.values()].slice(0, 50).map((e) => e.id),
          fingerprintKey: `${shop}:${isoWeek(now)}`,
          metadata: {
            shop,
            refundedOrders: refunded.size,
            placedOrders: placed.size,
            refundRatePercent: rate,
          },
        },
      ];
    });
  },
};
