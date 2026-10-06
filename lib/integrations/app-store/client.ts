import "server-only";
import {APP_STORE_API, APP_STORE_LIMITS} from "./config";
import {AppStoreKeyError, appStoreToken} from "./key";
import type {AppStoreApp, AppStoreKey, AppStoreReview} from "./types";

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

/** Apps and reviews only. Review replies and every non-GET request are refused before any request. */
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

type RawReview = {
  id?: string;
  attributes?: {
    rating?: number;
    title?: string;
    body?: string;
    createdDate?: string;
    territory?: string;
  };
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
      errors?: {detail?: string; title?: string}[];
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
    if (response.status === 403)
      throw new AppStoreError(
        "permission",
        "This API key can't read that app. Give the key the Customer Support role or higher.",
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
      `${APP_STORE_API}/v1/apps/${appStoreAppId(appId)}/customerReviews?sort=-createdDate&limit=100&fields[customerReviews]=rating,title,body,createdDate,territory`;
    const body = await this.call<{data?: RawReview[]; links?: {next?: string}}>(url);
    return {
      reviews: (body.data ?? [])
        .map(parseReview)
        .filter((item): item is AppStoreReview => Boolean(item)),
      next: body.links?.next,
    };
  }
}
