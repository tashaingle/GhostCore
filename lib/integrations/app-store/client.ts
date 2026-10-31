import "server-only";
import {gunzipSync} from "node:zlib";
import {APP_STORE_API, APP_STORE_LIMITS} from "./config";
import {AppStoreKeyError, appStoreToken} from "./key";
import type {AppStoreApp, AppStoreKey, AppStoreReview, DownloadDay} from "./types";

export type AppStoreErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "timeout" | "provider";

export class AppStoreError extends Error {
  constructor(
    public kind: AppStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AppStoreError";
  }
}

const APP_ID = /^\d{1,20}$/;
const BUNDLE = /^[A-Za-z0-9.-]{1,155}$/;
const VENDOR = /^\d{6,12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Apple's product type codes: first downloads, redownloads and updates, across iPhone, iPad and Mac. */
const DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "F1", "1E", "1EP", "1EU", "1-B", "F1-B"]);
const REDOWNLOAD_TYPES = new Set(["3", "3F", "3T", "F3"]);
const UPDATE_TYPES = new Set(["7", "7F", "7T", "F7"]);

export function appStoreVendorNumber(value: string) {
  const vendor = value.trim();
  if (!VENDOR.test(vendor))
    throw new AppStoreError(
      "provider",
      "The vendor number is the 8 or so digits shown in Payments and Financial Reports.",
    );
  return vendor;
}

/** Apple's daily sales summary (tab-separated) as downloads per app. In-app purchases are left out. */
export function parseSalesSummary(text: string, day: string): DownloadDay[] {
  const [header, ...rows] = text.split(/\r?\n/).filter((line) => line.trim());
  if (!header) return [];
  const columns = header.split("\t").map((name) => name.trim()),
    at = (name: string) => columns.indexOf(name),
    type = at("Product Type Identifier"),
    units = at("Units"),
    app = at("Apple Identifier");
  if (type < 0 || units < 0 || app < 0) return [];
  const byApp = new Map<string, DownloadDay>();
  for (const row of rows) {
    const cells = row.split("\t"),
      kind = cells[type]?.trim() ?? "",
      count = Number(cells[units]),
      id = cells[app]?.trim() ?? "";
    if (!APP_ID.test(id) || !Number.isFinite(count)) continue;
    const found = byApp.get(id) ?? {appId: id, day, downloads: 0, redownloads: 0, updates: 0};
    if (DOWNLOAD_TYPES.has(kind)) found.downloads += count;
    else if (REDOWNLOAD_TYPES.has(kind)) found.redownloads += count;
    else if (UPDATE_TYPES.has(kind)) found.updates += count;
    else continue;
    byApp.set(id, found);
  }
  return [...byApp.values()];
}

/** Apps, reviews and sales reports only. Review replies and every non-GET request are refused before any request. */
export function assertAppStoreRead(url: string, method: string) {
  const parsed = new URL(url);
  if (parsed.origin !== APP_STORE_API)
    throw new AppStoreError("permission", "Metric Mage only talks to App Store Connect.");
  if (/customerReviewResponses|\/response\b/i.test(parsed.pathname))
    throw new AppStoreError("permission", "Metric Mage does not reply to App Store reviews.");
  if (method.toUpperCase() !== "GET")
    throw new AppStoreError("permission", "Metric Mage only reads the App Store.");
}

export function appStoreAppId(value: string) {
  if (!APP_ID.test(value))
    throw new AppStoreError("provider", "That App Store app id is not valid.");
  return value;
}

type ApiErrors = {errors?: {code?: string; detail?: string; title?: string}[]};

type RawReview = {
  id?: string;
  attributes?: {
    rating?: number;
    title?: string;
    body?: string;
    createdDate?: string;
    territory?: string;
  };
  relationships?: {response?: {data?: {id?: string} | null}};
};

function parseReview(raw: RawReview): AppStoreReview | null {
  const id = (raw.id ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 120),
    a = raw.attributes ?? {},
    millis = Date.parse(a.createdDate ?? ""),
    rating = a.rating;
  if (!id || !Number.isFinite(millis) || !rating || rating < 1 || rating > 5) return null;
  return {
    reviewId: id,
    rating: Math.round(rating),
    title: a.title ?? "",
    body: a.body ?? "",
    seconds: Math.floor(millis / 1000),
    ...(a.territory && /^[A-Z]{3}$/.test(a.territory) ? {territory: a.territory} : {}),
    replied: Boolean(raw.relationships?.response?.data?.id),
  };
}

export class AppStoreClient {
  private requests = 0;
  private token?: {value: string; until: number};
  constructor(
    private key: AppStoreKey,
    private request: typeof fetch = fetch,
  ) {}
  private bearer() {
    const now = Date.now();
    if (!this.token || this.token.until < now + 60_000) {
      try {
        this.token = {
          value: appStoreToken(this.key, now),
          until: now + APP_STORE_LIMITS.tokenSeconds * 1000,
        };
      } catch (error) {
        throw new AppStoreError(
          "unauthorized",
          error instanceof AppStoreKeyError
            ? error.message
            : "The App Store key could not be used. Connect the App Store again.",
        );
      }
    }
    return this.token.value;
  }
  private async call<T>(url: string): Promise<T> {
    assertAppStoreRead(url, "GET");
    if (++this.requests > APP_STORE_LIMITS.requests)
      throw new AppStoreError("rate_limit", "App Store sync stopped at its request safety limit.");
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `Bearer ${this.bearer()}`, Accept: "application/json"},
        signal: AbortSignal.timeout(APP_STORE_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AppStoreError) throw error;
      throw new AppStoreError("timeout", "App Store Connect timed out.");
    }
    const body = (await response.json().catch(() => null)) as {
      errors?: {code?: string; detail?: string; title?: string}[];
    } | null;
    if (response.ok && body) return body as T;
    const first = body?.errors?.[0],
      message = (
        first?.detail ||
        first?.title ||
        `App Store Connect request failed (${response.status}).`
      ).slice(0, 180);
    if (response.status === 401)
      throw new AppStoreError(
        "unauthorized",
        "Apple didn't accept this API key. Check it hasn't been revoked, then connect again.",
      );
    if (response.status === 429)
      throw new AppStoreError(
        "rate_limit",
        "App Store Connect's limit was reached. Try again later.",
      );
    // Apple refuses every key until the Account Holder accepts new agreements.
    if (response.status === 403 && /AGREEMENT/i.test(`${first?.code ?? ""} ${message}`))
      throw new AppStoreError(
        "permission",
        "Apple is waiting for the Account Holder to accept an agreement in App Store Connect (Business). Accept it, then connect again.",
      );
    if (response.status === 403)
      throw new AppStoreError(
        "permission",
        `Apple refused this key: ${message} Check the key's role in App Store Connect (App Manager works), then connect again.`,
      );
    throw new AppStoreError("provider", message);
  }
  async apps(): Promise<AppStoreApp[]> {
    const found: AppStoreApp[] = [];
    let next: string | undefined = `${APP_STORE_API}/v1/apps?fields[apps]=name,bundleId&limit=200`;
    for (let page = 0; page < 2 && next && found.length < APP_STORE_LIMITS.storedApps; page++) {
      const body: {
        data?: {id?: string; attributes?: {name?: string; bundleId?: string}}[];
        links?: {next?: string};
      } = await this.call(next);
      for (const app of body.data ?? []) {
        if (!app.id || !APP_ID.test(app.id)) continue;
        if (found.some((item) => item.appId === app.id)) continue;
        const bundleId = app.attributes?.bundleId ?? "";
        found.push({
          appId: app.id,
          name: app.attributes?.name?.trim().slice(0, 120) || bundleId || app.id,
          bundleId: BUNDLE.test(bundleId) ? bundleId : "",
        });
      }
      next = body.links?.next;
    }
    return found.slice(0, APP_STORE_LIMITS.storedApps);
  }
  /** Newest first. Pass the `next` link back to read the following page. */
  async reviews(appId: string, next?: string) {
    const url =
      next ??
      `${APP_STORE_API}/v1/apps/${appStoreAppId(appId)}/customerReviews?sort=-createdDate&limit=100&fields[customerReviews]=rating,title,body,createdDate,territory,response&include=response`;
    const body = await this.call<{data?: RawReview[]; links?: {next?: string}}>(url);
    return {
      reviews: (body.data ?? [])
        .map(parseReview)
        .filter((item): item is AppStoreReview => Boolean(item)),
      next: body.links?.next,
    };
  }
  /**
   * One day's downloads per app. Apple answers 404 when a day had no sales or its report isn't
   * ready yet, so that reads as no downloads. Needs a key with the Sales or Finance role.
   */
  async downloads(vendorNumber: string, day: string): Promise<DownloadDay[]> {
    if (!DAY.test(day)) throw new AppStoreError("provider", "That report date is not valid.");
    const params = new URLSearchParams({
        "filter[frequency]": "DAILY",
        "filter[reportType]": "SALES",
        "filter[reportSubType]": "SUMMARY",
        "filter[vendorNumber]": appStoreVendorNumber(vendorNumber),
        "filter[reportDate]": day,
        "filter[version]": "1_1",
      }),
      url = `${APP_STORE_API}/v1/salesReports?${params}`;
    assertAppStoreRead(url, "GET");
    if (++this.requests > APP_STORE_LIMITS.requests)
      throw new AppStoreError("rate_limit", "App Store sync stopped at its request safety limit.");
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `Bearer ${this.bearer()}`, Accept: "application/a-gzip"},
        signal: AbortSignal.timeout(APP_STORE_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AppStoreError) throw error;
      throw new AppStoreError("timeout", "App Store Connect timed out.");
    }
    if (response.status === 404) return [];
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrors | null,
        detail = (body?.errors?.[0]?.detail ?? "").slice(0, 180);
      if (response.status === 401)
        throw new AppStoreError(
          "unauthorized",
          "Apple didn't accept the key used for downloads. Check it hasn't been revoked.",
        );
      if (response.status === 403)
        throw new AppStoreError(
          "permission",
          "Apple won't share sales reports with this key. Downloads need a key with the Sales (with access to reports), Finance or Admin role.",
        );
      if (response.status === 429)
        throw new AppStoreError(
          "rate_limit",
          "App Store Connect's limit was reached. Try again later.",
        );
      if (/vendor/i.test(detail))
        throw new AppStoreError(
          "provider",
          "Apple didn't recognise that vendor number. Copy it from Payments and Financial Reports.",
        );
      throw new AppStoreError(
        "provider",
        detail || `Apple's sales report failed (${response.status}).`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    try {
      const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
      return parseSalesSummary(plain.toString("utf8"), day);
    } catch {
      throw new AppStoreError("provider", "Apple's sales report couldn't be read.");
    }
  }
}
