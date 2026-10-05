import "server-only";
import type {ConnectorCredentialUpdate} from "../connector";
import {googlePlayOAuthEnv, PLAY_LIMITS} from "./config";
import type {CrashDay, PlayApp, PlayReview} from "./types";

export type GooglePlayErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "timeout" | "provider";

export class GooglePlayError extends Error {
  constructor(
    public kind: GooglePlayErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GooglePlayError";
  }
}

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const BLOCKED = /:reply\b|:refund\b|\/refund\b|reviewrefund/i;

/** Reviews and crash rates only. Reply, refund, and order changes are refused before any request. */
export function assertPlayRead(url: string, method: string) {
  if (BLOCKED.test(url))
    throw new GooglePlayError(
      "permission",
      "Metric Mage does not reply to Play reviews or refund orders.",
    );
  if (url.includes("androidpublisher.googleapis.com") && method.toUpperCase() !== "GET")
    throw new GooglePlayError("permission", "Metric Mage only reads Play reviews.");
}

export function playPackage(value: string) {
  if (!PACKAGE.test(value) || value.length > 200)
    throw new GooglePlayError("provider", "That Play app id is not valid.");
  return value;
}

type RawReview = {
  reviewId?: string;
  authorName?: string;
  comments?: {
    userComment?: {
      text?: string;
      starRating?: number;
      appVersionName?: string;
      lastModified?: {seconds?: string};
    };
  }[];
};

const decimal = (value: unknown) => {
  const raw = typeof value === "string" ? value : (value as {value?: string} | undefined)?.value;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

function parseReview(raw: RawReview): PlayReview | null {
  const id = (raw.reviewId ?? "").replace(/[\u0000-\u001f\s]/g, "").slice(0, 120);
  const comment = (raw.comments ?? [])
    .map((item) => item.userComment)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => Number(b.lastModified?.seconds ?? 0) - Number(a.lastModified?.seconds ?? 0))[0];
  const seconds = Number(comment?.lastModified?.seconds);
  const stars = comment?.starRating;
  if (!id || !comment || !Number.isFinite(seconds) || stars === undefined || stars < 1 || stars > 5)
    return null;
  return {
    reviewId: id,
    starRating: stars,
    text: comment.text ?? "",
    seconds,
    ...(comment.appVersionName ? {appVersionName: comment.appVersionName.slice(0, 40)} : {}),
  };
}

export class GooglePlayClient {
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
      throw new GooglePlayError(
        "unauthorized",
        "Google Play authorization has expired. Connect it again.",
      );
    const env = googlePlayOAuthEnv(),
      response = await this.request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.credentials.refreshToken,
        }),
        signal: AbortSignal.timeout(PLAY_LIMITS.timeoutMs),
      }),
      body = (await response.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
      } | null;
    if (!response.ok || !body?.access_token)
      throw new GooglePlayError(
        "unauthorized",
        "Google Play authorization could not be refreshed.",
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
  private async call<T>(url: string, init?: RequestInit): Promise<T> {
    const method = init?.method ?? "GET";
    assertPlayRead(url, method);
    if (++this.requests > PLAY_LIMITS.requests)
      throw new GooglePlayError(
        "rate_limit",
        "Google Play sync stopped at its request safety limit.",
      );
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: "application/json",
          ...init?.headers,
        },
        signal: AbortSignal.timeout(PLAY_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof GooglePlayError) throw error;
      throw new GooglePlayError("timeout", "Google Play timed out.");
    }
    const body = (await response.json().catch(() => null)) as {
      error?: {message?: string; status?: string};
    } | null;
    if (response.ok && body) return body as T;
    const message = (
      body?.error?.message || `Google Play request failed (${response.status}).`
    ).slice(0, 180);
    if (response.status === 401)
      throw new GooglePlayError(
        "unauthorized",
        "Google Play authorization has expired. Connect it again.",
      );
    if (response.status === 429)
      throw new GooglePlayError("rate_limit", "Google Play quota was reached. Try again later.");
    if (
      response.status === 403 &&
      /not been used|not been enabled|disabled|accessNotConfigured/i.test(message)
    )
      throw new GooglePlayError(
        "permission",
        "Turn on the Google Play Developer Reporting API and the Google Play Android Developer API, then connect again.",
      );
    if (response.status === 403)
      throw new GooglePlayError("permission", "This Google account can't read that Play app.");
    throw new GooglePlayError("provider", message);
  }
  async apps(): Promise<PlayApp[]> {
    const found: PlayApp[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 2 && found.length < PLAY_LIMITS.storedApps; page++) {
      const url = new URL("https://playdeveloperreporting.googleapis.com/v1beta1/apps:search");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = await this.call<{
        apps?: {packageName?: string; displayName?: string}[];
        nextPageToken?: string;
      }>(url.toString());
      for (const app of body.apps ?? []) {
        if (!app.packageName || !PACKAGE.test(app.packageName)) continue;
        if (found.some((item) => item.packageName === app.packageName)) continue;
        found.push({
          packageName: app.packageName,
          displayName: app.displayName?.trim() || app.packageName,
        });
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return found.slice(0, PLAY_LIMITS.storedApps);
  }
  async reviews(packageName: string, pageToken?: string) {
    const url = new URL(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(playPackage(packageName))}/reviews`,
    );
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("token", pageToken);
    const body = await this.call<{
      reviews?: RawReview[];
      tokenPagination?: {nextPageToken?: string};
    }>(url.toString());
    return {
      reviews: (body.reviews ?? [])
        .map(parseReview)
        .filter((item): item is PlayReview => Boolean(item)),
      nextPageToken: body.tokenPagination?.nextPageToken,
    };
  }
  async crashRates(packageName: string, start: Date, end: Date): Promise<CrashDay[]> {
    const stamp = (date: Date) => ({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      timeZone: {id: "UTC"},
    });
    const body = await this.call<{
      rows?: {
        startTime?: {year?: number; month?: number; day?: number};
        metrics?: {metric?: string; decimalValue?: unknown}[];
      }[];
    }>(
      `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${encodeURIComponent(playPackage(packageName))}/crashRateMetricSet:query`,
      {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          timelineSpec: {aggregationPeriod: "DAILY", startTime: stamp(start), endTime: stamp(end)},
          metrics: ["crashRate", "distinctUsers"],
          userCohort: "OS_PUBLIC",
          pageSize: 20,
        }),
      },
    );
    const days: CrashDay[] = [];
    for (const row of body.rows ?? []) {
      const time = row.startTime;
      if (!time?.year || !time.month || !time.day) continue;
      const crashRate = decimal(
        row.metrics?.find((metric) => metric.metric === "crashRate")?.decimalValue,
      );
      if (crashRate === undefined || crashRate < 0 || crashRate > 1) continue;
      const distinctUsers = decimal(
        row.metrics?.find((metric) => metric.metric === "distinctUsers")?.decimalValue,
      );
      days.push({
        day: `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`,
        crashRate,
        ...(distinctUsers !== undefined ? {distinctUsers} : {}),
      });
    }
    return days;
  }
}
