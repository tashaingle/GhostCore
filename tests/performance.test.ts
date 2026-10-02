import {describe, expect, it} from "vitest";
import {highlights, parsePeriod, performanceMetrics} from "@/lib/home/performance";
import type {IntelligenceEvent} from "@/lib/intelligence/types";

const NOW = new Date("2026-10-02T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
let seq = 0;
const ev = (
  eventType: string,
  d: number,
  metadata: Record<string, unknown> = {},
  source = eventType.split(".")[0],
): IntelligenceEvent => ({
  id: `e${++seq}`,
  source,
  eventType,
  title: eventType,
  description: null,
  severity: "info",
  occurredAt: daysAgo(d),
  recordedAt: daysAgo(d),
  metadata,
});
const pay = (d: number, amountMinor: number, extra: Record<string, unknown> = {}) =>
  ev("stripe.payment_succeeded", d, {mode: "live", currency: "gbp", amountMinor, ...extra});
const order = (d: number, amountMinor: number) =>
  ev("shopify.order_created", d, {orderId: `o${++seq}`, amountMinor, currency: "gbp"});
const metric = (list: ReturnType<typeof performanceMetrics>, key: string) =>
  list.find((m) => m.key === key);

describe("period selection", () => {
  it("defaults to week and accepts month and year", () => {
    expect(parsePeriod(undefined)).toBe("week");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("year")).toBe("year");
    expect(parsePeriod("decade")).toBe("week");
  });
});

describe("money metrics", () => {
  const events = [
    ...[1, 2, 3, 4].map((d) => pay(d, 10000)),
    ...[8, 9, 10].map((d) => pay(d, 10000)),
    pay(2, 99999, {mode: "test"}),
    ...[1, 2, 3, 4, 5].map((d) => order(d, 2000)),
    ...[8, 9, 10, 11, 12, 13, 14, 13, 12, 11].map((d) => order(d, 4000)),
  ];

  it("compares revenue, orders and average order value with the previous period", () => {
    const m = performanceMetrics({events, counts: {}, period: "week", now: NOW});
    expect(metric(m, "revenue")).toMatchObject({value: "£400.00", change: 33.3, source: "Stripe"});
    expect(metric(m, "orders")).toMatchObject({value: "5", change: -50});
    expect(metric(m, "aov")).toMatchObject({value: "£20.00", change: -50});
  });

  it("uses a longer window for month and year", () => {
    const m = performanceMetrics({events, counts: {}, period: "month", now: NOW});
    // All of these fall within the last 30 days, with nothing in the 30 before.
    expect(metric(m, "orders")).toMatchObject({value: "15", change: null, comparable: false});
  });

  it("counts each refund once and treats fewer refunds as good", () => {
    const refund = (d: number, id: string) =>
      ev("shopify.order_refunded", d, {orderId: id, amountMinor: 1000, currency: "gbp"});
    const m = performanceMetrics({
      events: [
        refund(1, "r1"),
        refund(1.5, "r1"),
        refund(8, "r2"),
        refund(9, "r3"),
        refund(10, "r4"),
        refund(11, "r5"),
      ],
      counts: {},
      period: "week",
      now: NOW,
    });
    expect(metric(m, "refunds")).toMatchObject({value: "1", change: -75, higherIsBetter: false});
  });
});

describe("marketing and operations metrics", () => {
  it("reports Facebook followers at the end of each period", () => {
    const page = (d: number, followers: number) =>
      ev("meta_social.facebook.performance.daily_recorded", d, {
        metrics: {followers, page_total_media_view_unique: 50},
      });
    const m = performanceMetrics({
      events: [page(1, 800), page(5, 780), page(8, 700), page(12, 690)],
      counts: {},
      period: "week",
      now: NOW,
    });
    expect(metric(m, "followers")).toMatchObject({value: "800", change: 14.3});
  });

  it("only shows activity counts for tools that have activity", () => {
    const m = performanceMetrics({
      events: [],
      counts: {emails: {current: 40, previous: 20}, meetings: {current: 0, previous: 0}},
      period: "week",
      now: NOW,
    });
    expect(m.map((x) => x.key)).toEqual(["emails"]);
    expect(metric(m, "emails")).toMatchObject({value: "40", change: 100, higherIsBetter: null});
  });
});

describe("going well and needs a look", () => {
  const base = {
    group: "Money" as const,
    source: "x",
    comparable: true,
  };

  it("sorts changes of 10% or more into good and bad", () => {
    const h = highlights(
      [
        {
          ...base,
          key: "revenue",
          label: "Revenue",
          value: "£400",
          change: 25,
          higherIsBetter: true,
        },
        {...base, key: "orders", label: "Orders", value: "5", change: -50, higherIsBetter: true},
        {...base, key: "refunds", label: "Refunds", value: "1", change: -75, higherIsBetter: false},
        {
          ...base,
          key: "aov",
          label: "Average order",
          value: "£20",
          change: 4,
          higherIsBetter: true,
        },
        {
          ...base,
          key: "adSpend",
          label: "Ad spend",
          value: "£90",
          change: 40,
          higherIsBetter: null,
        },
      ],
      "week",
    );
    expect(h).toEqual([
      {tone: "good", text: "Revenue up 25% to £400 compared with last week"},
      {tone: "bad", text: "Orders down 50% to 5 compared with last week"},
      {tone: "good", text: "Refunds down 75% to 1 compared with last week"},
    ]);
  });

  it("never judges without enough history", () => {
    expect(
      highlights(
        [
          {
            ...base,
            key: "orders",
            label: "Orders",
            value: "9",
            change: 80,
            higherIsBetter: true,
            comparable: false,
          },
        ],
        "month",
      ),
    ).toEqual([]);
  });

  it("calls out ad spend rising while return falls", () => {
    const h = highlights(
      [
        {
          ...base,
          group: "Marketing",
          key: "adSpend",
          label: "Ad spend",
          value: "£140",
          change: 40,
          higherIsBetter: null,
        },
        {
          ...base,
          group: "Marketing",
          key: "roas",
          label: "Return on ad spend",
          value: "1.20×",
          change: -35,
          higherIsBetter: true,
        },
      ],
      "month",
    );
    expect(h).toEqual([
      {
        tone: "bad",
        text: "Ad spend up 40% but return on ad spend fell 35% compared with last month",
      },
    ]);
  });
});
