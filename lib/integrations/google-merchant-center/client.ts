import "server-only";
import type {ConnectorCredentialUpdate} from "../connector";
import {MERCHANT_LIMITS, merchantCenterEnv} from "./config";
import type {
  AccountIssue,
  AggregateStatus,
  MerchantAccount,
  MerchantProduct,
  PerformanceDay,
} from "./types";

export type MerchantCenterErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "timeout" | "provider";

export class MerchantCenterError extends Error {
  constructor(
    public kind: MerchantCenterErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MerchantCenterError";
  }
}

const API = "https://merchantapi.googleapis.com";
const ACCOUNT = /^\d{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NO_ACCESS = "This Google login can't read that Merchant Center account.";
const NOT_REGISTERED =
  "Metric Mage's Google Cloud project isn't registered for the Merchant API yet. The site owner needs to register it once, then connect again.";

/**
 * Read-only. Google's Merchant API permission can also edit products, so every call except the
 * five reads Metric Mage needs is refused before a request is sent.
 */
export function assertMerchantRead(url: string, method: string) {
  const parsed = new URL(url),
    verb = method.toUpperCase(),
    path = parsed.pathname;
  if (parsed.hostname !== "merchantapi.googleapis.com")
    throw new MerchantCenterError("permission", "Metric Mage only talks to the Merchant API.");
  const reads = [
      /^\/accounts\/v1\/accounts$/,
      /^\/accounts\/v1\/accounts\/\d+\/issues$/,
      /^\/products\/v1\/accounts\/\d+\/products$/,
      /^\/issueresolution\/v1\/accounts\/\d+\/aggregateProductStatuses$/,
    ],
    search = /^\/reports\/v1\/accounts\/\d+\/reports:search$/;
  if (verb === "GET" && reads.some((pattern) => pattern.test(path))) return;
  if (verb === "POST" && search.test(path)) return;
  throw new MerchantCenterError("permission", "Metric Mage only reads Merchant Center.");
}

export function merchantAccountId(value: string) {
  const id = value.replace(/^accounts\//, "");
  if (!ACCOUNT.test(id))
    throw new MerchantCenterError("provider", "That Merchant Center account id is not valid.");
  return id;
}

const int = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

type ApiError = {
  error?: {
    message?: string;
    status?: string;
    details?: {reason?: string; errorCode?: string}[];
  };
};

export class MerchantCenterClient {
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
      throw new MerchantCenterError(
        "unauthorized",
        "Merchant Center authorization has expired. Connect it again.",
      );
    const env = merchantCenterEnv(),
      response = await this.request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.credentials.refreshToken,
        }),
        signal: AbortSignal.timeout(MERCHANT_LIMITS.timeoutMs),
      }),
      body = (await response.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
      } | null;
    if (!response.ok || !body?.access_token)
      throw new MerchantCenterError(
        "unauthorized",
        "Merchant Center authorization could not be refreshed.",
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
  private async call<T>(url: string, body?: unknown): Promise<T> {
    const method = body === undefined ? "GET" : "POST";
    assertMerchantRead(url, method);
    if (++this.requests > MERCHANT_LIMITS.requests)
      throw new MerchantCenterError(
        "rate_limit",
        "Merchant Center sync stopped at its request safety limit.",
      );
    let response: Response;
    try {
      response = await this.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: "application/json",
          ...(body === undefined ? {} : {"content-type": "application/json"}),
        },
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        signal: AbortSignal.timeout(MERCHANT_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof MerchantCenterError) throw error;
      throw new MerchantCenterError("timeout", "Merchant Center timed out.");
    }
    const json = (await response.json().catch(() => null)) as (ApiError & T) | null;
    if (response.ok && json) return json as T;
    const message = (
        json?.error?.message || `Merchant Center request failed (${response.status}).`
      ).slice(0, 180),
      reasons = (json?.error?.details ?? [])
        .map((d) => `${d.reason ?? ""} ${d.errorCode ?? ""}`)
        .join(" "),
      all = `${reasons} ${message}`;
    // An unregistered Cloud project also answers 401, but signing in again won't fix it.
    if (/GCP_NOT_REGISTERED|not registered/i.test(all))
      throw new MerchantCenterError("permission", NOT_REGISTERED);
    if (response.status === 401)
      throw new MerchantCenterError(
        "unauthorized",
        "Merchant Center authorization has expired. Connect it again.",
      );
    if (response.status === 429 || /RESOURCE_EXHAUSTED/.test(all))
      throw new MerchantCenterError(
        "rate_limit",
        "Merchant Center's limit was reached. Try again later.",
      );
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(all))
      throw new MerchantCenterError(
        "permission",
        "Turn on the Merchant API in Google Cloud, then connect again.",
      );
    if (response.status === 403) throw new MerchantCenterError("permission", NO_ACCESS);
    throw new MerchantCenterError("provider", message);
  }
  /** Merchant Center accounts this login can open. */
  async accounts(): Promise<MerchantAccount[]> {
    const found: MerchantAccount[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({pageSize: "250", ...(pageToken ? {pageToken} : {})}),
        body = await this.call<{
          accounts?: {name?: string; accountId?: string; accountName?: string}[];
          nextPageToken?: string;
        }>(`${API}/accounts/v1/accounts?${params}`);
      for (const account of body.accounts ?? []) {
        const id = String(account.accountId ?? account.name?.replace(/^accounts\//, "") ?? "");
        if (!ACCOUNT.test(id) || found.some((a) => a.accountId === id)) continue;
        found.push({
          accountId: id,
          name: account.accountName?.trim().slice(0, 120) || `Account ${id}`,
        });
      }
      pageToken = body.nextPageToken;
    } while (pageToken && found.length < MERCHANT_LIMITS.storedAccounts);
    return found.slice(0, MERCHANT_LIMITS.storedAccounts);
  }
  /** Product counts and the issues behind them, per reporting context and country. */
  async aggregateStatuses(accountId: string): Promise<AggregateStatus[]> {
    const body = await this.call<{aggregateProductStatuses?: AggregateStatus[]}>(
      `${API}/issueresolution/v1/accounts/${merchantAccountId(accountId)}/aggregateProductStatuses?pageSize=250`,
    );
    return body.aggregateProductStatuses ?? [];
  }
  /** Products with their status. `complete` is false when there were more than the cap. */
  async products(accountId: string) {
    const products: MerchantProduct[] = [];
    let pageToken: string | undefined,
      complete = true;
    for (let page = 0; page < MERCHANT_LIMITS.productPages; page++) {
      const params = new URLSearchParams({
          pageSize: String(MERCHANT_LIMITS.productsPerPage),
          ...(pageToken ? {pageToken} : {}),
        }),
        body = await this.call<{products?: MerchantProduct[]; nextPageToken?: string}>(
          `${API}/products/v1/accounts/${merchantAccountId(accountId)}/products?${params}`,
        );
      products.push(...(body.products ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
      if (page === MERCHANT_LIMITS.productPages - 1) complete = false;
    }
    return {products, complete};
  }
  /** Problems with the account itself, such as a suspension or a missing policy. */
  async accountIssues(accountId: string): Promise<AccountIssue[]> {
    const body = await this.call<{accountIssues?: AccountIssue[]}>(
      `${API}/accounts/v1/accounts/${merchantAccountId(accountId)}/issues?pageSize=${MERCHANT_LIMITS.accountIssues}&languageCode=en-GB`,
    );
    return (body.accountIssues ?? []).slice(0, MERCHANT_LIMITS.accountIssues);
  }
  /** Clicks and impressions per day, split into free listings and Shopping ads. */
  async performance(accountId: string, start: string, end: string): Promise<PerformanceDay[]> {
    if (!DAY.test(start) || !DAY.test(end))
      throw new MerchantCenterError("provider", "That reporting range is not valid.");
    const url = `${API}/reports/v1/accounts/${merchantAccountId(accountId)}/reports:search`,
      query = `SELECT date, marketing_method, clicks, impressions FROM product_performance_view WHERE date BETWEEN '${start}' AND '${end}'`,
      days = new Map<string, PerformanceDay>();
    let pageToken: string | undefined;
    for (let page = 0; page < 5; page++) {
      const body = await this.call<{
        results?: {
          productPerformanceView?: {
            date?: {year?: number; month?: number; day?: number};
            marketingMethod?: string;
            clicks?: string | number;
            impressions?: string | number;
          };
        }[];
        nextPageToken?: string;
      }>(url, {query, pageSize: 1000, ...(pageToken ? {pageToken} : {})});
      for (const row of body.results ?? []) {
        const view = row.productPerformanceView,
          d = view?.date;
        if (!d?.year || !d.month || !d.day) continue;
        const day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
          method =
            view?.marketingMethod === "ORGANIC" || view?.marketingMethod === "ADS"
              ? view.marketingMethod
              : "OTHER",
          key = `${day}|${method}`,
          found = days.get(key) ?? {day, marketingMethod: method, clicks: 0, impressions: 0};
        found.clicks += int(view?.clicks);
        found.impressions += int(view?.impressions);
        days.set(key, found);
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return [...days.values()].filter((d) => DAY.test(d.day));
  }
}
