import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  MERCHANT_SCOPES,
  merchantScopeGranted,
} from "@/lib/integrations/google-merchant-center/config";
import {
  assertMerchantRead,
  MerchantCenterClient,
  MerchantCenterError,
  merchantAccountId,
} from "@/lib/integrations/google-merchant-center/client";
import {MerchantCenterConnector} from "@/lib/integrations/google-merchant-center/connector";
import {authorisationUrl} from "@/lib/integrations/google-merchant-center/oauth";
import {
  countAggregates,
  countProducts,
  plainReason,
} from "@/lib/integrations/google-merchant-center/translator";
import {loadConnector} from "@/lib/integrations/loader";
import {getProvider, providerRegistry} from "@/lib/integrations/registry";
import {
  merchantAccountWarningRule,
  merchantDisapprovalsRisingRule,
} from "@/lib/intelligence/rules/commerce/merchant-center";
import {insightActionCategory} from "@/lib/notifications/insight-rules";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {statsSections} from "@/lib/stats/stats";
import type {NormalisedEventInput} from "@/types/events";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-30T06:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-30T06:00:00.000Z");
const token = {accessToken: "access", expiresAt: "2099-01-01T00:00:00.000Z"};
const API = "https://merchantapi.googleapis.com";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const account = {accountId: "123456789", name: "Unhinged Clothing", selected: true};

// Recorded shapes of Merchant API v1 responses, trimmed to the fields Metric Mage reads.
const aggregates = {
  aggregateProductStatuses: [
    {
      name: "accounts/123456789/aggregateProductStatuses/SHOPPING_ADS~GB",
      reportingContext: "SHOPPING_ADS",
      country: "GB",
      stats: {activeCount: "120", pendingCount: "3", disapprovedCount: "7", expiringCount: "2"},
      itemLevelIssues: [
        {
          code: "missing_size",
          severity: "DISAPPROVED",
          attribute: "size",
          description: "Missing value [size]",
          productCount: "5",
        },
        {
          code: "image_link_broken",
          severity: "DISAPPROVED",
          attribute: "image link",
          description: "Invalid image [image link]",
          productCount: "2",
        },
        {code: "gtin_missing", severity: "NOT_IMPACTED", productCount: "40"},
      ],
    },
    {
      reportingContext: "FREE_LISTINGS",
      country: "GB",
      stats: {activeCount: "118", pendingCount: "3", disapprovedCount: "5", expiringCount: "2"},
    },
  ],
};
const products = {
  products: [
    {
      name: "accounts/123456789/products/en~GB~hoodie-black-m",
      offerId: "hoodie-black-m",
      productAttributes: {title: "Unhinged Hoodie – Black, M"},
      productStatus: {
        destinationStatuses: [{reportingContext: "SHOPPING_ADS", disapprovedCountries: ["GB"]}],
        itemLevelIssues: [
          {
            code: "missing_size",
            severity: "DISAPPROVED",
            attribute: "size",
            description: "Missing value [size]",
          },
        ],
      },
    },
    {
      name: "accounts/123456789/products/en~GB~tee-white-s",
      offerId: "tee-white-s",
      productAttributes: {title: "Logo Tee – White, S"},
      productStatus: {
        destinationStatuses: [{reportingContext: "SHOPPING_ADS", approvedCountries: ["GB"]}],
        itemLevelIssues: [{code: "gtin_missing", severity: "NOT_IMPACTED"}],
        googleExpirationDate: "2026-11-02T00:00:00Z",
      },
    },
  ],
};
const accountIssues = {
  accountIssues: [
    {
      name: "accounts/123456789/issues/misrepresentation",
      title: "Account suspended due to policy violation: misrepresentation",
      severity: "CRITICAL",
      detail: "Your website must show a returns policy.",
      documentationUri: "https://support.google.com/merchants/answer/6150127",
      impactedDestinations: [
        {reportingContext: "SHOPPING_ADS", impacts: [{regionCode: "GB", severity: "CRITICAL"}]},
      ],
    },
    {name: "accounts/123456789/issues/tax", title: "Missing tax settings", severity: "SUGGESTION"},
  ],
};
const report = {
  results: [
    {
      productPerformanceView: {
        date: {year: 2026, month: 10, day: 28},
        marketingMethod: "ORGANIC",
        clicks: "30",
        impressions: "1200",
      },
    },
    {
      productPerformanceView: {
        date: {year: 2026, month: 10, day: 28},
        marketingMethod: "ADS",
        clicks: "12",
        impressions: "800",
      },
    },
    {
      productPerformanceView: {
        date: {year: 2026, month: 10, day: 29},
        marketingMethod: "ORGANIC",
        clicks: "4",
        impressions: "0",
      },
    },
  ],
};

function fakeMerchantApi(overrides: Record<string, Response> = {}) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    for (const [part, response] of Object.entries(overrides))
      if (href.includes(part)) return response;
    if (href.includes("/aggregateProductStatuses")) return reply(aggregates);
    if (href.includes("/products?")) return reply(products);
    if (href.includes("/issues?")) return reply(accountIssues);
    if (href.endsWith("/reports:search")) {
      const body = JSON.parse(String(init?.body));
      expect(body.query).toContain("FROM product_performance_view");
      expect(body.query).toContain("BETWEEN '2026-10-16' AND '2026-10-29'");
      return reply(report);
    }
    if (href.startsWith(`${API}/accounts/v1/accounts?`))
      return reply({
        accounts: [
          {name: "accounts/123456789", accountId: "123456789", accountName: "Unhinged Clothing"},
          {name: "accounts/987654321", accountId: "987654321", accountName: "Car Parts Direct"},
        ],
      });
    throw new Error(`Unexpected request ${href}`);
  });
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "super-secret";
  process.env.GOOGLE_MERCHANT_CENTER_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-merchant-center/callback";
});

describe("Merchant Center connection", () => {
  it("is on the Connections page and asks Google for Merchant API access", () => {
    const provider = getProvider("google_merchant_center");
    expect(provider?.connectPath).toBe("/api/integrations/google-merchant-center/connect");
    expect(provider?.configurationPath).toBe("/app/integrations/google-merchant-center/settings");
    expect(provider?.comingSoon).toBeUndefined();
    expect(providerRegistry.google_merchant_center.capabilities).not.toContain("read_only");
    const url = authorisationUrl("state", "verifier");
    for (const scope of MERCHANT_SCOPES) expect(url).toContain(encodeURIComponent(scope));
    expect(url).not.toContain("super-secret");
    expect(merchantScopeGranted(undefined)).toBe(true);
    expect(merchantScopeGranted("openid email")).toBe(false);
    expect(
      loadConnector("google_merchant_center", {accessToken: "a", settings: {}}),
    ).toBeInstanceOf(MerchantCenterConnector);
  });

  it("only allows the five reads Metric Mage needs", () => {
    expect(() => assertMerchantRead(`${API}/accounts/v1/accounts`, "GET")).not.toThrow();
    expect(() => assertMerchantRead(`${API}/accounts/v1/accounts/1/issues`, "GET")).not.toThrow();
    expect(() => assertMerchantRead(`${API}/products/v1/accounts/1/products`, "GET")).not.toThrow();
    expect(() =>
      assertMerchantRead(`${API}/issueresolution/v1/accounts/1/aggregateProductStatuses`, "GET"),
    ).not.toThrow();
    expect(() =>
      assertMerchantRead(`${API}/reports/v1/accounts/1/reports:search`, "POST"),
    ).not.toThrow();
    expect(() =>
      assertMerchantRead(`${API}/products/v1/accounts/1/productInputs:insert`, "POST"),
    ).toThrow(/only reads/);
    expect(() => assertMerchantRead(`${API}/products/v1/accounts/1/products`, "DELETE")).toThrow(
      MerchantCenterError,
    );
    expect(() => assertMerchantRead("https://example.com/accounts/v1/accounts", "GET")).toThrow(
      /only talks/,
    );
    expect(merchantAccountId("accounts/123")).toBe("123");
    expect(() => merchantAccountId("abc")).toThrow(/not valid/);
  });

  it("lists the accounts this login can pick from", async () => {
    const client = new MerchantCenterClient(token, fakeMerchantApi() as typeof fetch);
    expect(await client.accounts()).toEqual([
      {accountId: "123456789", name: "Unhinged Clothing"},
      {accountId: "987654321", name: "Car Parts Direct"},
    ]);
  });

  it("explains an unregistered Cloud project and expired sign-in differently", async () => {
    const unregistered = new MerchantCenterClient(token, (async () =>
      reply(
        {
          error: {
            status: "UNAUTHENTICATED",
            message: "GCP project is not registered",
            details: [{reason: "AUTH_GCP_NOT_REGISTERED"}],
          },
        },
        401,
      )) as typeof fetch);
    await expect(unregistered.accounts()).rejects.toMatchObject({kind: "permission"});
    await expect(unregistered.accounts()).rejects.toThrow(/register/);
    const expired = new MerchantCenterClient(token, (async () =>
      reply({error: {message: "Invalid Credentials"}}, 401)) as typeof fetch);
    await expect(expired.accounts()).rejects.toMatchObject({kind: "unauthorized"});
    const disabled = new MerchantCenterClient(token, (async () =>
      reply(
        {error: {message: "Merchant API has not been used in project 1 before or it is disabled."}},
        403,
      )) as typeof fetch);
    await expect(disabled.accounts()).rejects.toThrow(/Turn on the Merchant API/);
  });
});

describe("Merchant Center sync", () => {
  it("records a daily summary, disapprovals, account issues and Shopping clicks", async () => {
    const result = await new MerchantCenterConnector(
      new MerchantCenterClient(token, fakeMerchantApi() as typeof fetch),
      {accounts: [account, {accountId: "987654321", name: "Car Parts Direct"}]},
      fixedNow,
    ).sync(context);
    const byType = (type: string) => result.events.filter((e) => e.eventType === type);

    const [summary] = byType("google_merchant_center.products.daily_summary");
    expect(summary.title).toBe(
      "Merchant Center · Unhinged Clothing · 120 approved, 7 disapproved, 3 pending",
    );
    expect(summary.externalId).toBe("google_merchant_center:123456789:summary:2026-10-30");
    expect(summary.severity).toBe("critical");
    expect(summary.description).toMatch(/suspension/);
    expect(summary.metadata).toMatchObject({
      approved: 120,
      disapproved: 7,
      pending: 3,
      expiring: 2,
      total: 130,
      countedFrom: "google",
      reportingContext: "SHOPPING_ADS",
      country: "GB",
    });
    expect((summary.metadata?.topIssues as {reason: string; products: number}[])[0]).toEqual({
      reason: "Clothing details are missing: size, colour, gender or age group.",
      products: 5,
      disapproves: true,
    });

    const [disapproved] = byType("google_merchant_center.product.disapproved");
    expect(disapproved.title).toBe("Merchant Center · “Unhinged Hoodie – Black, M” disapproved");
    expect(disapproved.description).toBe(
      "Clothing details are missing: size, colour, gender or age group.",
    );
    expect(disapproved.metadata?.countries).toEqual(["GB"]);
    expect(byType("google_merchant_center.product.disapproved")).toHaveLength(1);

    const [suspension] = byType("google_merchant_center.account.suspension_warning");
    expect(suspension.severity).toBe("critical");
    expect(suspension.metadata?.regions).toEqual(["GB"]);
    expect(byType("google_merchant_center.account.issue")[0].severity).toBe("info");

    const performance = byType("google_merchant_center.performance.daily_recorded");
    expect(performance).toHaveLength(1);
    expect(performance[0].title).toBe(
      "Merchant Center · Unhinged Clothing · 42 clicks from 2,000 views",
    );
    expect(performance[0].externalId).toBe(
      "google_merchant_center:123456789:performance:2026-10-28:2026-10-30",
    );
    expect(performance[0].metadata?.metrics).toEqual({
      clicks: 42,
      impressions: 2000,
      freeListingClicks: 30,
      freeListingImpressions: 1200,
      adClicks: 12,
      adImpressions: 800,
    });
    expect(result.settings).toMatchObject({
      lastSyncAt: "2026-10-30T06:00:00.000Z",
      partialFailures: 0,
    });
  });

  it("counts products itself when Google's totals are unavailable, and carries on without reports", async () => {
    const request = fakeMerchantApi({
      "/aggregateProductStatuses": reply({error: {message: "Not found"}}, 404),
      "/reports:search": reply({error: {message: "Reports unavailable"}}, 400),
    });
    const result = await new MerchantCenterConnector(
      new MerchantCenterClient(token, request as typeof fetch),
      {accounts: [account]},
      fixedNow,
    ).sync(context);
    const summary = result.events.find(
      (e) => e.eventType === "google_merchant_center.products.daily_summary",
    )!;
    expect(summary.metadata).toMatchObject({
      approved: 1,
      disapproved: 1,
      expiring: 1,
      countedFrom: "products",
    });
    expect(result.settings).toMatchObject({partialFailures: 2});
  });

  it("stops on expired sign-in and asks for an account first", async () => {
    const expired = vi.fn(async () => reply({error: {message: "expired"}}, 401));
    await expect(
      new MerchantCenterConnector(
        new MerchantCenterClient(token, expired as typeof fetch),
        {accounts: [account]},
        fixedNow,
      ).sync(context),
    ).rejects.toMatchObject({kind: "unauthorized"});
    await expect(
      new MerchantCenterConnector(new MerchantCenterClient(token, expired as typeof fetch), {
        accounts: [{...account, selected: false}],
      }).sync(context),
    ).rejects.toThrow(/Choose a Merchant Center account/);
  });

  it("explains issues in plain English and counts each product once", () => {
    expect(
      plainReason({code: "image_link_broken", description: "Invalid image [image link]"}),
    ).toMatch(/product image/);
    expect(plainReason({code: "landing_page_error"})).toMatch(/couldn't open the product page/);
    expect(plainReason({code: "price_mismatch"})).toMatch(/price on your website/);
    expect(plainReason({code: "something_new", description: "Something brand new"})).toBe(
      "Something brand new.",
    );
    expect(countProducts(products.products, fixedNow())).toEqual({
      approved: 1,
      disapproved: 1,
      pending: 0,
      expiring: 1,
      total: 2,
    });
    expect(countAggregates(aggregates.aggregateProductStatuses)?.reportingContext).toBe(
      "SHOPPING_ADS",
    );
  });
});

let id = 0;
const asIntelligence = (
  event: NormalisedEventInput,
  recordedAt = event.occurredAt,
): IntelligenceEvent => ({
  id: `e${++id}`,
  source: event.source,
  eventType: event.eventType,
  title: event.title,
  description: event.description ?? null,
  severity: event.severity,
  occurredAt: event.occurredAt,
  recordedAt,
  metadata: event.metadata ?? {},
});
const summaryOn = (day: string, disapproved: number, issues: unknown[] = []) =>
  ({
    id: `s-${day}`,
    source: "google_merchant_center",
    eventType: "google_merchant_center.products.daily_summary",
    title: "summary",
    description: null,
    severity: "info",
    occurredAt: `${day}T12:00:00.000Z`,
    recordedAt: `${day}T12:00:00.000Z`,
    metadata: {
      sourceAccountId: "123456789",
      sourceEntityName: "Unhinged Clothing",
      approved: 130 - disapproved,
      disapproved,
      total: 130,
      topIssues: [
        {reason: "Clothing details are missing: size, colour, gender or age group.", products: 5},
      ],
      accountIssues: issues,
    },
  }) as IntelligenceEvent;

describe("Merchant Center insights and stats", () => {
  const now = new Date("2026-10-30T18:00:00Z");

  it("flags a clear rise in disapproved products and stays quiet otherwise", () => {
    const [insight] = merchantDisapprovalsRisingRule.evaluate(
      [summaryOn("2026-10-22", 4), summaryOn("2026-10-29", 40)],
      {now},
    );
    expect(insight.title).toBe("40 products disapproved in Merchant Center, up from 4");
    expect(insight.severity).toBe("critical");
    expect(insight.summary).toMatch(/Clothing details are missing/);
    expect(
      merchantDisapprovalsRisingRule.evaluate(
        [summaryOn("2026-10-22", 10), summaryOn("2026-10-29", 12)],
        {now},
      ),
    ).toEqual([]);
    // Without a reading from a week before there is nothing to compare.
    expect(merchantDisapprovalsRisingRule.evaluate([summaryOn("2026-10-29", 40)], {now})).toEqual(
      [],
    );
    expect(
      insightActionCategory({rule_id: merchantDisapprovalsRisingRule.id, severity: "warning"}),
    ).toBe("financial");
  });

  it("raises a critical warning while a suspension is open, and clears once it's gone", () => {
    const open = [
      {
        id: "abc",
        title: "Account suspended: misrepresentation",
        severity: "critical",
        suspension: true,
      },
    ];
    const [insight] = merchantAccountWarningRule.evaluate([summaryOn("2026-10-29", 3, open)], {
      now,
    });
    expect(insight.title).toBe(
      "Google has warned that Unhinged Clothing could be suspended from Shopping",
    );
    expect(insight.severity).toBe("critical");
    expect(
      merchantAccountWarningRule.evaluate(
        [summaryOn("2026-10-28", 3, open), summaryOn("2026-10-29", 3, [])],
        {now},
      ),
    ).toEqual([]);
    expect(
      merchantAccountWarningRule.evaluate(
        [summaryOn("2026-10-29", 3, [{id: "t", title: "Missing tax settings", severity: "info"}])],
        {now},
      ),
    ).toEqual([]);
  });

  it("adds a Merchant Center section to the stats page", async () => {
    const result = await new MerchantCenterConnector(
      new MerchantCenterClient(token, fakeMerchantApi() as typeof fetch),
      {accounts: [account]},
      fixedNow,
    ).sync(context);
    const events = [
      summaryOn("2026-10-20", 2),
      ...result.events.map((e) => asIntelligence(e, context.receivedAt)),
      // An earlier revision of the same day, which the newer one replaces.
      asIntelligence(
        {
          ...result.events.find(
            (e) => e.eventType === "google_merchant_center.performance.daily_recorded",
          )!,
          metadata: {
            sourceAccountId: "123456789",
            reportingDate: "2026-10-28",
            metrics: {clicks: 1, impressions: 5, freeListingClicks: 1, adClicks: 0},
          },
        },
        "2026-10-29T06:00:00.000Z",
      ),
    ];
    const merchant = statsSections({events, period: "week", now}).find(
      (s) => s.key === "merchant",
    )!;
    expect(merchant.title).toBe("Merchant Center");
    const chart = (key: string) => merchant.charts.find((c) => c.key === key)!;
    expect(chart("productsApproved").value).toBe(120);
    expect(chart("productsDisapproved")).toMatchObject({value: 7, lowerIsBetter: true});
    expect(chart("freeListingClicks").value).toBe(30);
    expect(chart("shoppingAdClicks").value).toBe(12);
    expect(chart("shoppingImpressions").value).toBe(2000);
    expect(statsSections({events: [], period: "week", now}).some((s) => s.key === "merchant")).toBe(
      false,
    );
  });
});
