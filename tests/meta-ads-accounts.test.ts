import {afterEach, describe, expect, it, vi} from "vitest";
import {MetaAdsClient} from "@/lib/integrations/meta-ads/client";

const account = (id: string, name: string, business?: {id: string; name: string}) => ({
  id: `act_${id}`,
  account_id: id,
  name,
  account_status: 1,
  currency: "GBP",
  timezone_name: "Europe/London",
  timezone_offset_hours_utc: 0,
  ...(business ? {business} : {}),
});

describe("Meta ad accounts", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("includes ad accounts owned by or shared with the person's businesses", async () => {
    vi.stubEnv("META_APP_ID", "1");
    vi.stubEnv("META_APP_SECRET", "s");
    vi.stubEnv("META_REDIRECT_URI", "https://x.test/cb");
    const responses: Record<string, unknown[]> = {
      "me/adaccounts": [account("1", "Tasha Card")],
      "me/businesses": [{id: "b1", name: "XUFU"}],
      "b1/owned_ad_accounts": [account("2", "XUFU ads")],
      // Also shared with the business: listed once, not twice.
      "b1/client_ad_accounts": [account("1", "Tasha Card")],
    };
    const request = (async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname.split("/").slice(2).join("/");
      return new Response(JSON.stringify({data: responses[path] ?? []}));
    }) as typeof fetch;
    const accounts = await new MetaAdsClient("t", request).accounts();
    expect(accounts.map((a) => [a.name, a.businessName])).toEqual([
      ["Tasha Card", undefined],
      ["XUFU ads", "XUFU"],
    ]);
  });

  it("still lists personal ad accounts when businesses can't be read", async () => {
    vi.stubEnv("META_APP_ID", "1");
    vi.stubEnv("META_APP_SECRET", "s");
    vi.stubEnv("META_REDIRECT_URI", "https://x.test/cb");
    const request = (async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname;
      return path.endsWith("me/adaccounts")
        ? new Response(JSON.stringify({data: [account("1", "Tasha Card")]}))
        : new Response(JSON.stringify({error: {message: "no", code: 200}}), {status: 403});
    }) as typeof fetch;
    expect((await new MetaAdsClient("t", request).accounts()).map((a) => a.name)).toEqual([
      "Tasha Card",
    ]);
  });
});
