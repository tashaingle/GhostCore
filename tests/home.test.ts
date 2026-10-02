import {describe, expect, it} from "vitest";
import {
  connectionStatus,
  sortConnections,
  timeAgo,
  type ConnectionRow,
} from "@/lib/home/connections";
import {weeklyPulse} from "@/lib/home/pulse";
import {getProvider} from "@/lib/integrations/registry";
import type {IntelligenceEvent} from "@/lib/intelligence/types";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const row = (overrides: Partial<ConnectionRow>): ConnectionRow => ({
  id: "i1",
  provider: "gmail",
  provider_account_name: "me@example.test",
  status: "connected",
  last_sync_at: hoursAgo(1),
  last_sync_status: "success",
  settings: {},
  ...overrides,
});
const status = (overrides: Partial<ConnectionRow>) => {
  const r = row(overrides);
  return connectionStatus(r, getProvider(r.provider), NOW);
};

describe("connection status", () => {
  it("reports an expired login with a reconnect link, ahead of staleness", () => {
    const s = status({status: "expired", last_sync_at: hoursAgo(24 * 60)});
    expect(s).toMatchObject({state: "expired", label: "Login expired", needsAttention: true});
    expect(s.action).toEqual({label: "Reconnect", href: "/api/integrations/gmail/connect"});
  });

  it("reconnects Shopify to the same store", () => {
    const s = status({
      provider: "shopify",
      status: "expired",
      settings: {shop: "acme.myshopify.com"},
    });
    expect(s.action?.href).toBe("/api/integrations/shopify/connect?shop=acme.myshopify.com");
  });

  it("falls back to the Connections page when there is no direct connect link", () => {
    expect(status({provider: "github", status: "expired"}).action?.href).toBe("/app/integrations");
  });

  it("flags connected tools that have quietly stopped syncing", () => {
    // GitHub syncs hourly, so two months without data is not "healthy".
    const s = status({provider: "github", last_sync_at: hoursAgo(24 * 60)});
    expect(s).toMatchObject({state: "stale", label: "Not syncing", needsAttention: true});
    expect(status({provider: "github", last_sync_at: hoursAgo(2)}).state).toBe("healthy");
    // Daily tools get longer before they count as stale.
    expect(status({provider: "google_analytics", last_sync_at: hoursAgo(30)}).state).toBe(
      "healthy",
    );
  });

  it("reports failing syncs and unfinished setup", () => {
    expect(status({last_sync_status: "error"}).state).toBe("failing");
    expect(status({settings: {configurationStatus: "property_required"}}).state).toBe("setup");
  });

  it("puts the most urgent problems first", () => {
    const sorted = sortConnections([
      status({id: "a", provider: "github"}),
      status({id: "b", provider: "github", last_sync_at: hoursAgo(100)}),
      status({id: "c", status: "expired"}),
    ]);
    expect(sorted.map((s) => s.state)).toEqual(["expired", "stale", "healthy"]);
  });

  it("describes times in plain English", () => {
    expect(timeAgo(null, NOW)).toBe("never");
    expect(timeAgo(hoursAgo(0.5), NOW)).toBe("30 min ago");
    expect(timeAgo(hoursAgo(1), NOW)).toBe("1 hour ago");
    expect(timeAgo(hoursAgo(72), NOW)).toBe("3 days ago");
    expect(timeAgo(hoursAgo(24 * 61), NOW)).toBe("on 2 Aug");
  });
});

let seq = 0;
const ev = (
  eventType: string,
  h: number,
  metadata: Record<string, unknown>,
): IntelligenceEvent => ({
  id: `e${++seq}`,
  source: eventType.split(".")[0],
  eventType,
  title: eventType,
  description: null,
  severity: "info",
  occurredAt: hoursAgo(h),
  recordedAt: hoursAgo(h),
  metadata,
});
const pay = (h: number, amountMinor: number, extra: Record<string, unknown> = {}) =>
  ev("stripe.payment_succeeded", h, {mode: "live", currency: "gbp", amountMinor, ...extra});

describe("weekly pulse", () => {
  it("compares revenue and orders with the previous week", () => {
    const pulse = weeklyPulse({
      events: [
        pay(24, 10000),
        pay(48, 5000),
        pay(24 * 9, 10000),
        ev("shopify.order_created", 24, {}),
        ev("shopify.order_created", 24 * 10, {}),
        ev("shopify.order_created", 24 * 11, {}),
      ],
      activity: {current: 120, previous: 100},
      now: NOW,
    });
    expect(pulse.map((m) => m.key)).toEqual(["revenue", "orders", "activity"]);
    expect(pulse[0]).toMatchObject({value: "£150.00", change: 50, source: "Stripe"});
    expect(pulse[1]).toMatchObject({value: "1", change: -50});
    expect(pulse[2]).toMatchObject({value: "120", change: 20});
  });

  it("prefers live payments and labels test-mode fallbacks", () => {
    const live = weeklyPulse({
      events: [pay(24, 1000), pay(24, 99999, {mode: "test"})],
      activity: {current: 0, previous: 0},
      now: NOW,
    });
    expect(live[0]).toMatchObject({value: "£10.00", source: "Stripe"});
    const test = weeklyPulse({
      events: [pay(24, 2500, {mode: "test"})],
      activity: {current: 0, previous: 0},
      now: NOW,
    });
    expect(test[0]).toMatchObject({value: "£25.00", source: "Stripe · test mode"});
  });

  it("shows no trend when there is nothing to compare against", () => {
    const pulse = weeklyPulse({
      events: [pay(24, 1000)],
      activity: {current: 5, previous: 0},
      now: NOW,
    });
    expect(pulse[0].change).toBeNull();
    expect(pulse[1].change).toBeNull();
  });

  it("only shows metrics for tools that have data", () => {
    expect(
      weeklyPulse({events: [], activity: {current: 0, previous: 0}, now: NOW}).map((m) => m.key),
    ).toEqual(["activity"]);
  });
});
