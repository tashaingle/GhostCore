import {beforeEach, describe, expect, it, vi} from "vitest";
import {ADS_SCOPES, adsScopeGranted} from "@/lib/integrations/google-ads/config";
import {
  adsCustomerId,
  assertAdsRead,
  GoogleAdsClient,
  GoogleAdsError,
} from "@/lib/integrations/google-ads/client";
import {GoogleAdsConnector, markSpendJumps} from "@/lib/integrations/google-ads/connector";
import {authorisationUrl} from "@/lib/integrations/google-ads/oauth";
import {googleAdsAccountDays} from "@/lib/intelligence/windows";
import {loadConnector} from "@/lib/integrations/loader";
import {providerRegistry} from "@/lib/integrations/registry";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-08T06:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-08T06:00:00.000Z");
const token = {accessToken: "access", expiresAt: "2099-01-01T00:00:00.000Z"};
const API = "https://googleads.googleapis.com/v25";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const account = {customerId: "1234567890", name: "Rabbitcare", currency: "GBP", selected: true};

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "super-secret";
  process.env.GOOGLE_ADS_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-ads/callback";
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
  delete process.env.GOOGLE_ADS_API_VERSION;
});

describe("Google Ads connection", () => {
  it("asks for Ads access and keeps the secret out of the url", () => {
    const url = authorisationUrl("state", "verifier");
    for (const scope of ADS_SCOPES) expect(url).toContain(encodeURIComponent(scope));
    expect(url).not.toContain("super-secret");
    expect(adsScopeGranted(undefined)).toBe(true);
    expect(adsScopeGranted("openid email")).toBe(false);
    expect(providerRegistry.google_ads.capabilities).not.toContain("read_only");
    expect(providerRegistry.google_ads.connectPath).toBe("/api/integrations/google-ads/connect");
  });

  it("only allows the account list and report searches", () => {
    expect(() => assertAdsRead(`${API}/customers:listAccessibleCustomers`, "GET")).not.toThrow();
    expect(() =>
      assertAdsRead(`${API}/customers/1234567890/googleAds:search`, "POST"),
    ).not.toThrow();
    expect(() => assertAdsRead(`${API}/customers/1234567890/googleAds:mutate`, "POST")).toThrow(
      /never changes/,
    );
    expect(() => assertAdsRead(`${API}/customers/1234567890/campaigns:mutate`, "POST")).toThrow(
      GoogleAdsError,
    );
    expect(() => assertAdsRead(`${API}/customers/1234567890/campaignBudgets`, "POST")).toThrow(
      /only reads/,
    );
    expect(() =>
      assertAdsRead("https://example.com/v25/customers:listAccessibleCustomers", "GET"),
    ).toThrow(GoogleAdsError);
    expect(adsCustomerId("123-456-7890")).toBe("1234567890");
    expect(() => adsCustomerId("12345")).toThrow(/not valid/);
  });

  it("lists ad accounts, skipping managers and unreadable ones, with the developer token", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      expect(new Headers(init?.headers).get("developer-token")).toBe("dev-token");
      if (href.endsWith(":listAccessibleCustomers"))
        return reply({
          resourceNames: ["customers/1234567890", "customers/2222222222", "customers/3333333333"],
        });
      if (href.includes("2222222222"))
        return reply({results: [{customer: {descriptiveName: "Agency", manager: true}}]});
      if (href.includes("3333333333"))
        return reply(
          {
            error: {
              message: "denied",
              details: [{errors: [{errorCode: {authorizationError: "USER_PERMISSION_DENIED"}}]}],
            },
          },
          403,
        );
      return reply({results: [{customer: {descriptiveName: "Rabbitcare", currencyCode: "GBP"}}]});
    });
    expect(await new GoogleAdsClient(token, request as typeof fetch).accounts()).toEqual([
      {customerId: "1234567890", name: "Rabbitcare", currency: "GBP"},
    ]);
  });

  it("flags a day that spends at least double the others", () => {
    const day = (d: string, pounds: number) => ({
      ...account,
      day: d,
      campaigns: [
        {
          campaignId: "1",
          name: "Brand",
          day: d,
          costMicros: BigInt(pounds * 1_000_000),
          impressions: 1,
          clicks: 1,
          conversions: 0,
          conversionsValue: 0,
        },
      ],
    });
    const marked = markSpendJumps([
      day("2026-10-01", 10),
      day("2026-10-02", 12),
      day("2026-10-03", 11),
      day("2026-10-04", 40),
    ]);
    expect(marked.map((d) => d.spendJump)).toEqual([false, false, false, true]);
  });

  it("syncs one event per account day and feeds home ad spend", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.query).toContain("BETWEEN '2026-09-24' AND '2026-10-07'");
      return reply({
        results: [
          {
            campaign: {id: "11", name: "Brand"},
            segments: {date: "2026-10-06"},
            metrics: {
              costMicros: "12500000",
              impressions: "900",
              clicks: "40",
              conversions: 2,
              conversionsValue: 90,
            },
          },
          {
            campaign: {id: "12", name: "Search"},
            segments: {date: "2026-10-06"},
            metrics: {
              costMicros: "2500000",
              impressions: "100",
              clicks: "5",
              conversions: 0,
              conversionsValue: 0,
            },
          },
        ],
      });
    });
    const result = await new GoogleAdsConnector(
      new GoogleAdsClient(token, request as typeof fetch),
      {accounts: [account]},
      fixedNow,
    ).sync(context);
    expect(result.events).toHaveLength(1);
    const event = result.events[0];
    expect(event.title).toBe("Google Ads · Rabbitcare · £15.00 spent, 45 clicks, 2 conversions");
    expect(event.description).toBe("£7.50 per conversion.");
    expect(event.externalId).toBe("google_ads:1234567890:2026-10-06:2026-10-08");
    expect((event.metadata?.campaigns as {name: string}[])[0].name).toBe("Brand");
    const days = googleAdsAccountDays(
      [
        {
          id: "e1",
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          recordedAt: "2026-10-08T06:00:00Z",
          metadata: event.metadata ?? {},
        } as never,
      ],
      fixedNow(),
    );
    expect(days[0]).toMatchObject({accountId: "1234567890", spend: 15, purchaseValue: 90});
    await expect(
      new GoogleAdsConnector(new GoogleAdsClient(token, request as typeof fetch), {
        accounts: [],
      }).sync(context),
    ).rejects.toThrow(/Choose at least one/);
  });

  it("explains missing API access", async () => {
    const client = new GoogleAdsClient(token, (async () =>
      reply(
        {
          error: {
            message: "x",
            details: [
              {errors: [{errorCode: {authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED"}}]},
            ],
          },
        },
        403,
      )) as typeof fetch);
    await expect(client.accounts()).rejects.toThrow(/hasn't given this site Google Ads API access/);
    const listOk = new GoogleAdsClient(token, (async (url: RequestInfo | URL) =>
      String(url).endsWith(":listAccessibleCustomers")
        ? reply({resourceNames: ["customers/1234567890"]})
        : reply(
            {
              error: {
                message: "x",
                details: [
                  {errors: [{errorCode: {authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED"}}]},
                ],
              },
            },
            403,
          )) as typeof fetch);
    await expect(listOk.accounts()).rejects.toThrow(/hasn't given this site/);
    expect(loadConnector("google_ads", {accessToken: "a", settings: {}}).provider).toBe(
      "google_ads",
    );
  });
});
