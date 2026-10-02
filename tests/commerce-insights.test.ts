import {describe, expect, it} from "vitest";
import {evaluateRules} from "@/lib/intelligence/runner";
import {
  adSpendUpOrdersDownRule,
  intelligenceRules,
  metaReturnDeclineRule,
  shopifyOrderDeclineRule,
  shopifyRefundRateRule,
  stripeDisputeRule,
  stripeFailureRateRule,
  stripePayoutFailedRule,
  stripeRevenueDeclineRule,
} from "@/lib/intelligence/rules";
import {isoWeek} from "@/lib/intelligence/windows";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {maintenanceJobs} from "@/lib/jobs/registry";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ctx = {now: NOW};
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const dateAgo = (days: number) => daysAgo(days).slice(0, 10);
let seq = 0;
const ev = (
  eventType: string,
  occurredAt: string,
  metadata: Record<string, unknown>,
  recordedAt?: string,
): IntelligenceEvent => ({
  id: `e${++seq}`,
  source: eventType.split(".")[0],
  eventType,
  title: eventType,
  description: null,
  severity: "info",
  occurredAt,
  recordedAt,
  metadata,
});

const SHOP = "acme.myshopify.com";
/** `count` orders spread evenly across [fromDaysAgo, toDaysAgo). */
const orders = (count: number, fromDaysAgo: number, toDaysAgo: number, shop = SHOP) =>
  Array.from({length: count}, (_, i) =>
    ev("shopify.order_created", daysAgo(fromDaysAgo - ((fromDaysAgo - toDaysAgo) * i) / count), {
      shop,
      orderId: `o${++seq}`,
    }),
  );
const history = () => orders(1, 20, 19); // proves the store's data reaches back past both windows

const payment = (
  type: "succeeded" | "failed",
  days: number,
  id: string,
  extra: Record<string, unknown> = {},
) =>
  ev(`stripe.payment_${type}`, daysAgo(days), {
    mode: "live",
    providerObjectId: id,
    paymentId: id,
    amountMinor: 1000,
    currency: "gbp",
    ...extra,
  });

const metaDay = (
  days: number,
  spend: string,
  purchases: number,
  value: number,
  recordedAt = daysAgo(days),
  accountId = "act_1",
) =>
  ev(
    "meta_ads.performance.daily_recorded",
    `${dateAgo(days)}T12:00:00.000Z`,
    {
      sourceAccountId: accountId,
      sourceEntityType: "account",
      reportingDate: dateAgo(days),
      currency: "GBP",
      metrics: {
        spend,
        spendMicros: String(Math.round(Number(spend) * 1_000_000)),
        attributedPurchases: String(purchases),
        attributedPurchaseValue: String(value),
      },
    },
    recordedAt,
  );
const metaWeeks = (before: [string, number, number], after: [string, number, number]) => [
  ...[8, 9, 10, 11, 12, 13, 14].map((d) => metaDay(d, ...before)),
  ...[1, 2, 3, 4, 5, 6, 7].map((d) => metaDay(d, ...after)),
];

describe("Shopify order decline", () => {
  it("flags a week-on-week drop and escalates large drops", () => {
    const warning = shopifyOrderDeclineRule.evaluate(
      [...history(), ...orders(20, 14, 7), ...orders(12, 7, 0)],
      ctx,
    );
    expect(warning).toHaveLength(1);
    expect(warning[0]).toMatchObject({
      severity: "warning",
      metadata: {previousOrders: 20, currentOrders: 12, changePercent: -40},
    });
    const critical = shopifyOrderDeclineRule.evaluate(
      [...history(), ...orders(20, 14, 7), ...orders(5, 7, 0)],
      ctx,
    );
    expect(critical[0].severity).toBe("critical");
  });

  it("ignores stores without enough history or volume", () => {
    // Newly connected: no data before the previous window.
    expect(
      shopifyOrderDeclineRule.evaluate([...orders(20, 13, 7), ...orders(2, 7, 0)], ctx),
    ).toEqual([]);
    // Too few orders to judge.
    expect(
      shopifyOrderDeclineRule.evaluate(
        [...history(), ...orders(6, 14, 7), ...orders(1, 7, 0)],
        ctx,
      ),
    ).toEqual([]);
  });

  it("evaluates each store separately", () => {
    const other = "other.myshopify.com";
    const result = shopifyOrderDeclineRule.evaluate(
      [
        ...history(),
        ...orders(20, 14, 7),
        ...orders(5, 7, 0),
        ...orders(1, 20, 19, other),
        ...orders(20, 14, 7, other),
        ...orders(20, 7, 0, other),
      ],
      ctx,
    );
    expect(result.map((r) => r.metadata?.shop)).toEqual([SHOP]);
  });
});

describe("Shopify refund rate", () => {
  it("counts each refunded order once", () => {
    const placed = orders(20, 13, 1),
      refundOf = (o: IntelligenceEvent) =>
        ev("shopify.order_refunded", daysAgo(0.5), {shop: SHOP, orderId: o.metadata.orderId}),
      // Order 0 changed twice after its refund, producing two refund events.
      refunds = [
        refundOf(placed[0]),
        refundOf(placed[0]),
        refundOf(placed[1]),
        refundOf(placed[2]),
      ];
    const result = shopifyRefundRateRule.evaluate([...placed, ...refunds], ctx);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      refundedOrders: 3,
      placedOrders: 20,
      refundRatePercent: 15,
    });
  });

  it("stays quiet below the minimum number of refunds", () => {
    const placed = orders(5, 13, 1),
      refunds = placed
        .slice(0, 2)
        .map((o) =>
          ev("shopify.order_refunded", daysAgo(0.5), {shop: SHOP, orderId: o.metadata.orderId}),
        );
    expect(shopifyRefundRateRule.evaluate([...placed, ...refunds], ctx)).toEqual([]);
  });
});

describe("Stripe payment failures", () => {
  it("counts recovered payments as successes and escalates high rates", () => {
    const events = [
      ...Array.from({length: 10}, (_, i) => payment("succeeded", 2, `ok${i}`)),
      ...Array.from({length: 5}, (_, i) => payment("failed", 2, `lost${i}`)),
      // A failed attempt later recovered on retry, and a second failure of the same payment.
      payment("failed", 3, "retry"),
      payment("failed", 3, "lost0"),
      payment("succeeded", 2, "retry"),
    ];
    const result = stripeFailureRateRule.evaluate(events, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: "critical",
      metadata: {failedPayments: 5, attemptedPayments: 16, failureRatePercent: 31.3},
    });
  });

  it("ignores test-mode payments", () => {
    const events = Array.from({length: 8}, (_, i) => payment("failed", 1, `t${i}`, {mode: "test"}));
    expect(stripeFailureRateRule.evaluate(events, ctx)).toEqual([]);
  });
});

describe("Stripe revenue decline", () => {
  it("compares each currency separately", () => {
    const gbp = (days: number, i: number, amount: number) =>
      payment("succeeded", days, `g${days}-${i}`, {amountMinor: amount});
    const events = [
      payment("succeeded", 20, "old"),
      ...Array.from({length: 10}, (_, i) => gbp(10, i, 5000)),
      ...Array.from({length: 10}, (_, i) => gbp(2, i, 2000)),
      // USD is steady and must not be mixed into GBP.
      payment("succeeded", 20, "usd-old", {currency: "usd"}),
      ...Array.from({length: 12}, (_, i) => payment("succeeded", 10, `u1-${i}`, {currency: "usd"})),
      ...Array.from({length: 12}, (_, i) => payment("succeeded", 2, `u2-${i}`, {currency: "usd"})),
    ];
    const result = stripeRevenueDeclineRule.evaluate(events, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      currency: "gbp",
      previousAmountMinor: 50000,
      currentAmountMinor: 20000,
      changePercent: -60,
    });
    expect(result[0].summary).toContain("£200.00");
  });
});

describe("Stripe money at risk", () => {
  const dispute = (type: string, days: number, status: string) =>
    ev(`stripe.${type}`, daysAgo(days), {
      mode: "live",
      providerObjectId: "dp_1",
      status,
      displayAmount: "£40.00",
      currency: "gbp",
    });

  it("flags a dispute only while it needs a response", () => {
    const open = stripeDisputeRule.evaluate([dispute("dispute_opened", 2, "needs_response")], ctx);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({severity: "critical", fingerprintKey: "dp_1"});
    expect(
      stripeDisputeRule.evaluate(
        [
          dispute("dispute_opened", 2, "needs_response"),
          dispute("dispute_updated", 1, "under_review"),
        ],
        ctx,
      ),
    ).toEqual([]);
  });

  it("flags failed live payouts", () => {
    const failed = ev("stripe.payout_failed", daysAgo(1), {mode: "live", providerObjectId: "po_1"});
    expect(stripePayoutFailedRule.evaluate([failed], ctx)).toHaveLength(1);
    expect(
      stripePayoutFailedRule.evaluate(
        [{...failed, metadata: {...failed.metadata, mode: "test"}}],
        ctx,
      ),
    ).toEqual([]);
  });
});

describe("Meta Ads return decline", () => {
  it("flags falling purchase value while spend holds", () => {
    const result = metaReturnDeclineRule.evaluate(metaWeeks(["100", 4, 400], ["105", 2, 200]), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({
      previousSpend: 700,
      currentSpend: 735,
      previousPurchaseValue: 2800,
      currentPurchaseValue: 1400,
      purchaseValueChangePercent: -50,
    });
  });

  it("does not flag when spend was cut", () => {
    expect(metaReturnDeclineRule.evaluate(metaWeeks(["100", 4, 400], ["50", 2, 200]), ctx)).toEqual(
      [],
    );
  });

  it("uses only the latest revision of each day", () => {
    const events = metaWeeks(["100", 4, 400], ["100", 4, 400]);
    // Meta later revised one recent day downwards; the earlier figure must not be double-counted.
    for (const d of [1, 2, 3, 4, 5, 6, 7])
      events.push(metaDay(d, "100", 1, 50, new Date(NOW.getTime() - 1000).toISOString()));
    const result = metaReturnDeclineRule.evaluate(events, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({currentSpend: 700, currentPurchaseValue: 350});
  });

  it("ignores today's partial day", () => {
    const events = [...metaWeeks(["100", 4, 400], ["100", 4, 400]), metaDay(0, "9999", 0, 0)];
    expect(metaReturnDeclineRule.evaluate(events, ctx)).toEqual([]);
  });
});

describe("ad spend up while orders fall", () => {
  it("flags opposite movements without claiming causation", () => {
    const events = [
      ...metaWeeks(["100", 4, 400], ["130", 4, 400]),
      ...history(),
      ...orders(20, 14, 7),
      ...orders(14, 7, 0),
    ];
    const result = adSpendUpOrdersDownRule.evaluate(events, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toMatchObject({spendChangePercent: 30, orderChangePercent: -30});
    expect(result[0].explanation).toContain("does not prove");
  });

  it("does nothing when ad accounts use different currencies", () => {
    const events = [
      ...metaWeeks(["100", 4, 400], ["130", 4, 400]),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((d) => ({
        ...metaDay(d, "100", 1, 100, undefined, "act_2"),
        metadata: {...metaDay(d, "100", 1, 100, undefined, "act_2").metadata, currency: "USD"},
      })),
      ...history(),
      ...orders(20, 14, 7),
      ...orders(14, 7, 0),
    ];
    expect(adSpendUpOrdersDownRule.evaluate(events, ctx)).toEqual([]);
  });
});

describe("insight scheduling and identity", () => {
  it("keeps one insight per problem per week", () => {
    const events = [...history(), ...orders(20, 14, 7), ...orders(5, 7, 0)],
      thisWeek = evaluateRules(events, intelligenceRules, NOW),
      laterSameWeek = evaluateRules(events, intelligenceRules, new Date("2026-10-03T09:00:00Z")),
      nextWeek = evaluateRules(events, intelligenceRules, new Date("2026-10-06T09:00:00Z"));
    const fp = (list: typeof thisWeek) =>
      list.find((i) => i.ruleId === "commerce.shopify_order_decline")?.fingerprint;
    expect(fp(laterSameWeek)).toBe(fp(thisWeek));
    expect(fp(nextWeek)).not.toBe(fp(thisWeek));
  });

  it("labels ISO weeks across year boundaries", () => {
    expect(isoWeek(new Date("2026-10-02T00:00:00Z"))).toBe("2026-W40");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });

  it("refreshes insights hourly in the background", () =>
    expect(maintenanceJobs).toContainEqual(
      expect.objectContaining({key: "intelligence.evaluate", scheduleValue: "1h"}),
    ));
});
