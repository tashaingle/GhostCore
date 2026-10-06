import "server-only";
import type {ConnectorCredentialUpdate} from "../connector";
import {BUSINESS_PROFILE_LIMITS, businessProfileOAuthEnv} from "./config";
import type {ActivityDay, BusinessLocation, BusinessReview} from "./types";

export type BusinessProfileErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "timeout" | "provider";

export class BusinessProfileError extends Error {
  constructor(
    public kind: BusinessProfileErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BusinessProfileError";
  }
}

const HOSTS = new Set([
  "mybusinessaccountmanagement.googleapis.com",
  "mybusinessbusinessinformation.googleapis.com",
  "mybusiness.googleapis.com",
  "businessprofileperformance.googleapis.com",
]);
const ACCOUNT = /^accounts\/\d{1,30}$/;
const LOCATION = /^locations\/\d{1,30}$/;

/** Reads only. Review replies and every non-GET request are refused before any request. */
export function assertBusinessRead(url: string, method: string) {
  const parsed = new URL(url);
  if (!HOSTS.has(parsed.hostname))
    throw new BusinessProfileError("permission", "Metric Mage only talks to Business Profile.");
  if (/\/reply\b|:reply\b/i.test(parsed.pathname))
    throw new BusinessProfileError(
      "permission",
      "Metric Mage does not reply to Business Profile reviews.",
    );
  if (method.toUpperCase() !== "GET")
    throw new BusinessProfileError("permission", "Metric Mage only reads Business Profile.");
}

export function businessIds(account: string, location: string) {
  if (!ACCOUNT.test(account) || !LOCATION.test(location))
    throw new BusinessProfileError("provider", "That Business Profile location is not valid.");
  return {account, location};
}

const STARS: Record<string, number> = {ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5};

type RawReview = {
  reviewId?: string;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: {comment?: string};
};

function parseReview(raw: RawReview): BusinessReview | null {
  const id = (raw.reviewId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200),
    stars = STARS[raw.starRating ?? ""],
    millis = Date.parse(raw.createTime ?? "");
  if (!id || !stars || !Number.isFinite(millis)) return null;
  return {
    reviewId: id,
    starRating: stars,
    // Google appends a machine translation to some comments; keep the reviewer's own words.
    comment: (raw.comment ?? "").split("(Translated by Google)")[0],
    seconds: Math.floor(millis / 1000),
    replied: Boolean(raw.reviewReply?.comment),
  };
}

function address(raw?: {addressLines?: string[]; locality?: string; postalCode?: string}) {
  if (!raw) return undefined;
  const text = [raw.addressLines?.[0], raw.locality, raw.postalCode].filter(Boolean).join(", ");
  return text ? text.slice(0, 160) : undefined;
}

const ACTIVITY = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "views",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "views",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "views",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "views",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_DIRECTION_REQUESTS: "directions",
} as const;

export class BusinessProfileClient {
  private access: string;
  private expiry?: string;
  private updated?: ConnectorCredentialUpdate;
  private requests = 0;
  constructor(
    private credentials: {accessToken: string; refreshToken?: string; expiresAt?: string},
    private request: typeof fetch = fetch,
  ) {
    this.access = credentials.accessToken;
    this.expiry = credentials.expiresAt;
  }
  credentialUpdate() {
    return this.updated;
  }
  private async token() {
    if (!this.expiry || Date.parse(this.expiry) > Date.now() + 60_000) return this.access;
    if (!this.credentials.refreshToken)
      throw new BusinessProfileError(
        "unauthorized",
        "Google Business Profile authorization has expired. Connect it again.",
      );
    const env = businessProfileOAuthEnv(),
      response = await this.request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.credentials.refreshToken,
        }),
        signal: AbortSignal.timeout(BUSINESS_PROFILE_LIMITS.timeoutMs),
      }),
      body = (await response.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
      } | null;
    if (!response.ok || !body?.access_token)
      throw new BusinessProfileError(
        "unauthorized",
        "Google Business Profile authorization could not be refreshed.",
      );
    this.access = body.access_token;
    this.expiry = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString();
    this.updated = {
      accessToken: this.access,
      refreshToken: this.credentials.refreshToken,
      expiresAt: this.expiry,
    };
    return this.access;
  }
  private async call<T>(url: string): Promise<T> {
    assertBusinessRead(url, "GET");
    if (++this.requests > BUSINESS_PROFILE_LIMITS.requests)
      throw new BusinessProfileError(
        "rate_limit",
        "Business Profile sync stopped at its request safety limit.",
      );
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `Bearer ${await this.token()}`, Accept: "application/json"},
        signal: AbortSignal.timeout(BUSINESS_PROFILE_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof BusinessProfileError) throw error;
      throw new BusinessProfileError("timeout", "Google Business Profile timed out.");
    }
    const body = (await response.json().catch(() => null)) as {
      error?: {message?: string; status?: string};
    } | null;
    if (response.ok && body) return body as T;
    const message = (
      body?.error?.message || `Business Profile request failed (${response.status}).`
    ).slice(0, 180);
    if (response.status === 401)
      throw new BusinessProfileError(
        "unauthorized",
        "Google Business Profile authorization has expired. Connect it again.",
      );
    // Google starts every new project on a quota of zero until it approves API access.
    // Its message doesn't always say so, but a sync sends far fewer requests than an
    // approved project's quota, so any quota refusal most likely means "not approved yet".
    if (response.status === 429 && /quota.*\b0\b|limit.*\b0\b/i.test(message))
      throw new BusinessProfileError(
        "permission",
        "Google hasn't approved this site for the Business Profile APIs yet. Request access in Google Cloud, then connect again.",
      );
    if (response.status === 429)
      throw new BusinessProfileError(
        "rate_limit",
        "Google refused for quota. If Google hasn't approved Business Profile API access for this site yet, that's the cause: request access in Google Cloud. Otherwise, try again later.",
      );
    if (
      response.status === 403 &&
      /not been used|not been enabled|disabled|accessNotConfigured/i.test(message)
    )
      throw new BusinessProfileError(
        "permission",
        "Turn on the Business Profile APIs in Google Cloud, then connect again.",
      );
    if (response.status === 403)
      throw new BusinessProfileError(
        "permission",
        "This Google account can't manage that business. Ask an owner to add it as a manager.",
      );
    throw new BusinessProfileError("provider", message);
  }
  async locations(): Promise<BusinessLocation[]> {
    const accounts = await this.call<{accounts?: {name?: string}[]}>(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
      ),
      found: BusinessLocation[] = [];
    for (const item of (accounts.accounts ?? []).slice(0, BUSINESS_PROFILE_LIMITS.accounts)) {
      const account = item.name ?? "";
      if (!ACCOUNT.test(account)) continue;
      let pageToken: string | undefined;
      for (let page = 0; page < 2; page++) {
        const url = new URL(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`,
        );
        url.searchParams.set("readMask", "name,title,storefrontAddress");
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const body = await this.call<{
          locations?: {
            name?: string;
            title?: string;
            storefrontAddress?: {addressLines?: string[]; locality?: string; postalCode?: string};
          }[];
          nextPageToken?: string;
        }>(url.toString());
        for (const raw of body.locations ?? []) {
          const location = raw.name ?? "";
          if (!LOCATION.test(location) || found.some((item) => item.location === location))
            continue;
          const where = address(raw.storefrontAddress);
          found.push({
            account,
            location,
            title: raw.title?.trim().slice(0, 120) || "Business",
            ...(where ? {address: where} : {}),
          });
        }
        pageToken = body.nextPageToken;
        if (!pageToken || found.length >= BUSINESS_PROFILE_LIMITS.storedLocations) break;
      }
      if (found.length >= BUSINESS_PROFILE_LIMITS.storedLocations) break;
    }
    return found.slice(0, BUSINESS_PROFILE_LIMITS.storedLocations);
  }
  /** Newest first. Reviews still live on the v4 API. */
  async reviews(account: string, location: string, pageToken?: string) {
    const ids = businessIds(account, location),
      url = new URL(`https://mybusiness.googleapis.com/v4/${ids.account}/${ids.location}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await this.call<{
      reviews?: RawReview[];
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
    }>(url.toString());
    return {
      reviews: (body.reviews ?? [])
        .map(parseReview)
        .filter((item): item is BusinessReview => Boolean(item)),
      averageRating: body.averageRating,
      totalReviewCount: body.totalReviewCount,
      nextPageToken: body.nextPageToken,
    };
  }
  async activity(location: string, start: Date, end: Date): Promise<ActivityDay[]> {
    if (!LOCATION.test(location))
      throw new BusinessProfileError("provider", "That Business Profile location is not valid.");
    const url = new URL(
      `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries`,
    );
    for (const metric of Object.keys(ACTIVITY)) url.searchParams.append("dailyMetrics", metric);
    for (const [prefix, date] of [
      ["dailyRange.startDate", start],
      ["dailyRange.endDate", end],
    ] as const) {
      url.searchParams.set(`${prefix}.year`, String(date.getUTCFullYear()));
      url.searchParams.set(`${prefix}.month`, String(date.getUTCMonth() + 1));
      url.searchParams.set(`${prefix}.day`, String(date.getUTCDate()));
    }
    const body = await this.call<{
      multiDailyMetricTimeSeries?: {
        dailyMetricTimeSeries?: {
          dailyMetric?: string;
          timeSeries?: {
            datedValues?: {date?: {year?: number; month?: number; day?: number}; value?: string}[];
          };
        }[];
      }[];
    }>(url.toString());
    const days = new Map<string, ActivityDay>();
    for (const group of body.multiDailyMetricTimeSeries ?? [])
      for (const series of group.dailyMetricTimeSeries ?? []) {
        const field = ACTIVITY[series.dailyMetric as keyof typeof ACTIVITY];
        if (!field) continue;
        for (const point of series.timeSeries?.datedValues ?? []) {
          const d = point.date;
          if (!d?.year || !d.month || !d.day) continue;
          const day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
            row = days.get(day) ?? {day, views: 0, calls: 0, websiteClicks: 0, directions: 0},
            // Google leaves the value off on days with nothing to count.
            value = Number(point.value ?? 0);
          if (Number.isFinite(value) && value >= 0) row[field] += value;
          days.set(day, row);
        }
      }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  }
}
