import {generateKeyPairSync} from "node:crypto";
import {gzipSync} from "node:zlib";
import {describe, expect, it, vi} from "vitest";
import {
  AppStoreClient,
  appStoreVendorNumber,
  parseSalesSummary,
} from "@/lib/integrations/app-store/client";
import {AppStoreConnector} from "@/lib/integrations/app-store/connector";
import {parseAppStoreKey} from "@/lib/integrations/app-store/key";
import {loadConnector} from "@/lib/integrations/loader";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {statsSections} from "@/lib/stats/stats";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-31T09:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-31T09:00:00.000Z");
const makeKey = (keyId: string) =>
  parseAppStoreKey({
    issuerId: "57246542-96fe-1a63-e053-0824d011072a",
    keyId,
    privateKey: generateKeyPairSync("ec", {namedCurve: "prime256v1"})
      .privateKey.export({type: "pkcs8", format: "pem"})
      .toString(),
  });
const mainKey = makeKey("3CD3FUTTZY");
const reportsKey = makeKey("FIN4NCE123");
const plotly = {
  appId: "6450000001",
  name: "Plotly",
  bundleId: "com.example.plotly",
  selected: true,
};

// Apple's Summary Sales Report, version 1_1, trimmed to a few columns but in Apple's order.
const HEADER = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Version",
  "Product Type Identifier",
  "Units",
  "Developer Proceeds",
  "Begin Date",
  "End Date",
  "Customer Currency",
  "Country Code",
  "Currency of Proceeds",
  "Apple Identifier",
].join("\t");
const row = (type: string, units: number, appleId: string, country = "GB") =>
  [
    "APPLE",
    "US",
    "plotly",
    "Natasha Card",
    "Plotly",
    "1.2",
    type,
    units,
    "0",
    "10/29/2026",
    "10/29/2026",
    "GBP",
    country,
    "GBP",
    appleId,
  ].join("\t");
const report = (...rows: string[]) => gzipSync(Buffer.from([HEADER, ...rows].join("\n") + "\n"));
const gzipReply = (bytes: Buffer) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {"content-type": "application/a-gzip"},
  });
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const dayOf = (url: RequestInfo | URL) =>
  new URL(String(url)).searchParams.get("filter[reportDate]");

describe("App Store downloads", () => {
  it("reads first downloads, redownloads and updates per app, leaving out in-app purchases", () => {
    const text = [
      HEADER,
      row("1F", 12, "6450000001"),
      row("1F", 3, "6450000001", "US"),
      row("F1", 1, "6450000001"),
      row("3F", 4, "6450000001"),
      row("7F", 40, "6450000001"),
      row("IA1", 9, "6450000099"),
      row("1F", 5, "7770000002"),
    ].join("\n");
    expect(parseSalesSummary(text, "2026-10-29")).toEqual([
      {appId: "6450000001", day: "2026-10-29", downloads: 16, redownloads: 4, updates: 40},
      {appId: "7770000002", day: "2026-10-29", downloads: 5, redownloads: 0, updates: 0},
    ]);
    expect(parseSalesSummary("", "2026-10-29")).toEqual([]);
    expect(appStoreVendorNumber(" 87654321 ")).toBe("87654321");
    expect(() => appStoreVendorNumber("abc")).toThrow(/Payments and Financial Reports/);
  });

  it("asks Apple for the daily summary as gzip and treats a missing day as no downloads", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe("/v1/salesReports");
      expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
        "filter[frequency]": "DAILY",
        "filter[reportType]": "SALES",
        "filter[reportSubType]": "SUMMARY",
        "filter[vendorNumber]": "87654321",
        "filter[version]": "1_1",
      });
      expect(new Headers(init?.headers).get("accept")).toBe("application/a-gzip");
      return dayOf(url) === "2026-10-29"
        ? gzipReply(report(row("1F", 7, "6450000001")))
        : reply(
            {errors: [{code: "NOT_FOUND", detail: "There were no sales for the date specified."}]},
            404,
          );
    });
    const client = new AppStoreClient(mainKey, request as typeof fetch);
    expect(await client.downloads("87654321", "2026-10-29")).toEqual([
      {appId: "6450000001", day: "2026-10-29", downloads: 7, redownloads: 0, updates: 0},
    ]);
    expect(await client.downloads("87654321", "2026-10-30")).toEqual([]);
  });

  it("explains a key whose role can't read sales reports", async () => {
    const client = new AppStoreClient(mainKey, (async () =>
      reply({errors: [{status: "403", code: "FORBIDDEN_ERROR"}]}, 403)) as typeof fetch);
    await expect(client.downloads("87654321", "2026-10-29")).rejects.toThrow(
      /Sales \(with access to reports\), Finance or Admin/,
    );
  });

  it("syncs a month of downloads for chosen apps, using the reports key, without blocking reviews", async () => {
    const reviews = vi.fn(async () => reply({data: []})),
      sales = vi.fn(async (url: RequestInfo | URL) =>
        dayOf(url) === "2026-10-29"
          ? gzipReply(
              report(
                row("1F", 12, "6450000001"),
                row("3F", 2, "6450000001"),
                row("1F", 9, "9990000000"),
              ),
            )
          : reply({errors: [{code: "NOT_FOUND"}]}, 404),
      );
    const result = await new AppStoreConnector(
      new AppStoreClient(mainKey, reviews as typeof fetch),
      {apps: [plotly], vendorNumber: "87654321"},
      fixedNow,
      new AppStoreClient(reportsKey, sales as typeof fetch),
    ).sync(context);
    expect(sales).toHaveBeenCalledTimes(30);
    expect(dayOf(sales.mock.calls[0][0])).toBe("2026-10-30");
    expect(dayOf(sales.mock.calls[29][0])).toBe("2026-10-01");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      source: "app_store",
      eventType: "app_store.downloads.daily_recorded",
      title: "App Store · Plotly · 12 downloads",
      description: "Plus 2 redownloads by people who had it before.",
      occurredAt: "2026-10-29T12:00:00.000Z",
      externalId: "app_store:downloads:6450000001:2026-10-29",
      metadata: {appId: "6450000001", downloads: 12, redownloads: 2, updates: 0},
    });
    expect(result.settings).toMatchObject({
      downloadsError: null,
      downloadsSyncedAt: "2026-10-31T09:00:00.000Z",
    });

    // Later syncs only look back a week.
    sales.mockClear();
    await new AppStoreConnector(
      new AppStoreClient(mainKey, reviews as typeof fetch),
      {apps: [plotly], vendorNumber: "87654321", downloadsSyncedAt: "2026-10-30T09:00:00.000Z"},
      fixedNow,
      new AppStoreClient(reportsKey, sales as typeof fetch),
    ).sync(context);
    expect(sales).toHaveBeenCalledTimes(7);
  });

  it("keeps syncing reviews and records why downloads failed", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/salesReports")
        ? reply({errors: [{code: "FORBIDDEN_ERROR"}]}, 403)
        : reply({
            data: [
              {
                id: "r1",
                attributes: {
                  rating: 5,
                  title: "Lovely",
                  body: "Great app",
                  createdDate: "2026-10-30T10:00:00Z",
                },
              },
            ],
          }),
    );
    const result = await new AppStoreConnector(
      new AppStoreClient(mainKey, request as typeof fetch),
      {apps: [plotly], vendorNumber: "87654321"},
      fixedNow,
    ).sync(context);
    expect(result.events.map((e) => e.eventType)).toEqual(["app_store.review.received"]);
    expect(result.settings.downloadsError).toMatch(/Finance or Admin/);
    expect(result.settings.downloadsSyncedAt).toBeUndefined();
  });

  it("doesn't read sales reports until a vendor number is saved", async () => {
    const request = vi.fn<(url: RequestInfo | URL) => Promise<Response>>(async () =>
      reply({data: []}),
    );
    await new AppStoreConnector(
      new AppStoreClient(mainKey, request as typeof fetch),
      {apps: [plotly]},
      fixedNow,
    ).sync(context);
    expect(request.mock.calls.every(([url]) => !String(url).includes("salesReports"))).toBe(true);
  });

  it("loads the separate reports key from the stored refresh token", () => {
    expect(
      loadConnector("app_store", {
        accessToken: JSON.stringify(mainKey),
        refreshToken: JSON.stringify(reportsKey),
        settings: {},
      }).provider,
    ).toBe("app_store");
    expect(() =>
      loadConnector("app_store", {accessToken: JSON.stringify(mainKey), refreshToken: "nope"}),
    ).toThrow(/can't be read/);
  });

  it("adds an Apps section to the stats page", () => {
    const now = new Date("2026-10-31T18:00:00Z");
    const downloads = (day: string, appId: string, n: number, again = 0) =>
      ({
        id: `${appId}-${day}`,
        source: "app_store",
        eventType: "app_store.downloads.daily_recorded",
        title: "downloads",
        description: null,
        severity: "info",
        occurredAt: `${day}T12:00:00.000Z`,
        recordedAt: `${day}T12:00:00.000Z`,
        metadata: {appId, downloads: n, redownloads: again},
      }) as IntelligenceEvent;
    const apps = statsSections({
      events: [
        downloads("2026-10-20", "1", 10),
        downloads("2026-10-28", "1", 12, 2),
        downloads("2026-10-29", "1", 8),
        downloads("2026-10-29", "2", 5),
      ],
      period: "week",
      now,
    }).find((s) => s.key === "apps")!;
    expect(apps.title).toBe("Apps");
    expect(apps.charts.find((c) => c.key === "appDownloads")).toMatchObject({
      value: 25,
      change: 150,
      source: "App Store",
    });
    expect(apps.charts.find((c) => c.key === "appRedownloads")?.value).toBe(2);
  });
});
