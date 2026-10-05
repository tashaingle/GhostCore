import {describe, expect, it} from "vitest";
import {
  connectionStatus,
  sortConnections,
  timeAgo,
  type ConnectionRow,
} from "@/lib/home/connections";
import {getProvider} from "@/lib/integrations/registry";

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
    expect(
      status({
        last_sync_status: "error",
        last_sync_error: "Search Console property permission was denied.",
      }).detail,
    ).toBe("Search Console property permission was denied.");
    expect(status({settings: {configurationStatus: "property_required"}}).state).toBe("setup");
    expect(
      status({
        provider: "google_search_console",
        last_sync_status: "error",
        last_sync_error: "Choose at least one Search Console property before syncing.",
        settings: {configurationStatus: "property_required"},
      }).state,
    ).toBe("setup");
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
