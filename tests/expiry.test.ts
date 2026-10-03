import {describe, expect, it} from "vitest";
import {trulyExpired} from "@/lib/jobs/expiry";

const now = new Date("2026-10-03T09:05:00Z");
const row = (id: string, expires: string | null, refresh: string | null, status = "connected") => ({
  id,
  status,
  token_expires_at: expires,
  refresh_token_encrypted: refresh,
});

describe("connection expiry check", () => {
  it("doesn't flag Google connections whose hourly token lapsed but can renew", () => {
    expect(trulyExpired([row("ga", "2026-10-02T20:00:00Z", "v1.enc")], now)).toEqual([]);
  });

  it("flags logins that have run out with no way to renew", () => {
    expect(trulyExpired([row("meta", "2026-10-01T00:00:00Z", null)], now).map((r) => r.id)).toEqual(
      ["meta"],
    );
  });

  it("ignores logins still valid, without expiry, or already disconnected", () => {
    expect(
      trulyExpired(
        [
          row("future", "2026-12-01T00:00:00Z", null),
          row("none", null, null),
          row("gone", "2026-10-01T00:00:00Z", null, "disconnected"),
        ],
        now,
      ),
    ).toEqual([]);
  });
});
