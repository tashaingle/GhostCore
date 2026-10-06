import "server-only";
import type {ConnectorCredentialUpdate} from "../connector";
import {ADS_LIMITS, googleAdsEnv} from "./config";
import type {AdsAccount, CampaignDay} from "./types";

export type GoogleAdsErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "timeout" | "provider";

export class GoogleAdsError extends Error {
  constructor(
    public kind: GoogleAdsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsError";
  }
}

const CUSTOMER = /^\d{10}$/;
const NOT_ENABLED = "That Google Ads account is cancelled or not set up yet.";
const NO_ACCESS = "This Google login can't read that Google Ads account.";
const ACCOUNT_LEVEL = new Set([NOT_ENABLED, NO_ACCESS]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reporting only. The two calls Metric Mage makes are allowed; anything else on the Ads API,
 * and every mutate, is refused before a request is sent.
 */
export function assertAdsRead(url: string, method: string) {
  const parsed = new URL(url),
    verb = method.toUpperCase();
  if (parsed.hostname !== "googleads.googleapis.com")
    throw new GoogleAdsError("permission", "Metric Mage only talks to the Google Ads API.");
  if (/mutate/i.test(parsed.pathname))
    throw new GoogleAdsError("permission", "Metric Mage never changes Google Ads accounts.");
  const list = /^\/v\d+\/customers:listAccessibleCustomers$/.test(parsed.pathname),
    search = /^\/v\d+\/customers\/\d{10}\/googleAds:search$/.test(parsed.pathname);
  if (!(list && verb === "GET") && !(search && verb === "POST"))
    throw new GoogleAdsError("permission", "Metric Mage only reads Google Ads reports.");
}

export function adsCustomerId(value: string) {
  const id = value.replace(/-/g, "");
  if (!CUSTOMER.test(id))
    throw new GoogleAdsError("provider", "That Google Ads account id is not valid.");
  return id;
}

const int = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const dec = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const micros = (value: unknown) => {
  const raw = String(value ?? "0");
  return /^\d{1,20}$/.test(raw) ? BigInt(raw) : 0n;
};

type ApiError = {
  error?: {
    message?: string;
    status?: string;
    details?: {errors?: {errorCode?: Record<string, string>; message?: string}[]}[];
  };
};

function adsErrorCodes(body: ApiError | null) {
  return (body?.error?.details ?? [])
    .flatMap((d) => d.errors ?? [])
    .flatMap((e) => Object.values(e.errorCode ?? {}))
    .join(" ");
}

export class GoogleAdsClient {
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
      throw new GoogleAdsError(
        "unauthorized",
        "Google Ads authorization has expired. Connect it again.",
      );
    const env = googleAdsEnv(),
      response = await this.request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          grant_type: "refresh_token",
          refresh_token: this.credentials.refreshToken,
        }),
        signal: AbortSignal.timeout(ADS_LIMITS.timeoutMs),
      }),
      body = (await response.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
      } | null;
    if (!response.ok || !body?.access_token)
      throw new GoogleAdsError("unauthorized", "Google Ads authorization could not be refreshed.");
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
    assertAdsRead(url, method);
    if (++this.requests > ADS_LIMITS.requests)
      throw new GoogleAdsError(
        "rate_limit",
        "Google Ads sync stopped at its request safety limit.",
      );
    const env = googleAdsEnv();
    let response: Response;
    try {
      response = await this.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: "application/json",
          ...(env.developerToken ? {"developer-token": env.developerToken} : {}),
          ...(body === undefined ? {} : {"content-type": "application/json"}),
        },
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        signal: AbortSignal.timeout(ADS_LIMITS.timeoutMs),
      });
    } catch (error) {
      if (error instanceof GoogleAdsError) throw error;
      throw new GoogleAdsError("timeout", "Google Ads timed out.");
    }
    const json = (await response.json().catch(() => null)) as (ApiError & T) | null;
    if (response.ok && json) return json as T;
    const codes = adsErrorCodes(json),
      message = (json?.error?.message || `Google Ads request failed (${response.status}).`).slice(
        0,
        180,
      );
    if (response.status === 401)
      throw new GoogleAdsError(
        "unauthorized",
        "Google Ads authorization has expired. Connect it again.",
      );
    if (response.status === 429 || /RESOURCE_EXHAUSTED/.test(codes))
      throw new GoogleAdsError(
        "rate_limit",
        "Google Ads' daily limit was reached. Try again later.",
      );
    if (/DEVELOPER_TOKEN|NOT_ALLOWLISTED|PROJECT_NOT/i.test(`${codes} ${message}`))
      throw new GoogleAdsError(
        "permission",
        "Google hasn't given this site Google Ads API access yet. Check the access level in Google Cloud.",
      );
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(`${codes} ${message}`))
      throw new GoogleAdsError(
        "permission",
        "Turn on the Google Ads API in Google Cloud, then connect again.",
      );
    if (/CUSTOMER_NOT_ENABLED/.test(codes))
      throw new GoogleAdsError(
        "permission",
        "That Google Ads account is cancelled or not set up yet.",
      );
    if (response.status === 403)
      throw new GoogleAdsError(
        "permission",
        "This Google login can't read that Google Ads account.",
      );
    throw new GoogleAdsError("provider", message);
  }
  private async search<R>(customerId: string, query: string) {
    const env = googleAdsEnv(),
      url = `https://googleads.googleapis.com/${env.version}/customers/${adsCustomerId(customerId)}/googleAds:search`,
      rows: R[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < ADS_LIMITS.pages; page++) {
      const body = await this.call<{results?: R[]; nextPageToken?: string}>(url, {
        query,
        ...(pageToken ? {pageToken} : {}),
      });
      rows.push(...(body.results ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return rows;
  }
  /** Ad accounts this login can open directly. Manager accounts are skipped: they hold no ads. */
  async accounts(): Promise<AdsAccount[]> {
    const env = googleAdsEnv(),
      list = await this.call<{resourceNames?: string[]}>(
        `https://googleads.googleapis.com/${env.version}/customers:listAccessibleCustomers`,
      ),
      ids = (list.resourceNames ?? [])
        .map((name) => name.replace(/^customers\//, ""))
        .filter((id) => CUSTOMER.test(id))
        .slice(0, ADS_LIMITS.storedAccounts),
      found: AdsAccount[] = [];
    for (const id of ids) {
      try {
        const [row] = await this.search<{
          customer?: {descriptiveName?: string; currencyCode?: string; manager?: boolean};
        }>(
          id,
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1",
        );
        if (!row?.customer || row.customer.manager) continue;
        const currency = row.customer.currencyCode ?? "";
        found.push({
          customerId: id,
          name: row.customer.descriptiveName?.trim().slice(0, 120) || `Account ${id}`,
          currency: /^[A-Z]{3}$/.test(currency) ? currency : "GBP",
        });
      } catch (error) {
        // A cancelled or unreadable account shouldn't hide the others; site-wide access problems should.
        if (!(error instanceof GoogleAdsError && ACCOUNT_LEVEL.has(error.message))) throw error;
      }
    }
    return found;
  }
  /** Spend and results per campaign per day, for days with any activity. */
  async campaignDays(customerId: string, start: string, end: string): Promise<CampaignDay[]> {
    if (!DAY.test(start) || !DAY.test(end))
      throw new GoogleAdsError("provider", "That reporting range is not valid.");
    const rows = await this.search<{
      campaign?: {id?: string; name?: string};
      segments?: {date?: string};
      metrics?: Record<string, unknown>;
    }>(
      customerId,
      `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0`,
    );
    const days: CampaignDay[] = [];
    for (const row of rows) {
      const id = String(row.campaign?.id ?? ""),
        day = row.segments?.date ?? "";
      if (!/^\d{1,20}$/.test(id) || !DAY.test(day)) continue;
      const m = row.metrics ?? {};
      days.push({
        campaignId: id,
        name: row.campaign?.name?.trim().slice(0, 120) || `Campaign ${id}`,
        day,
        costMicros: micros(m.costMicros),
        impressions: int(m.impressions),
        clicks: int(m.clicks),
        conversions: dec(m.conversions),
        conversionsValue: dec(m.conversionsValue),
      });
    }
    return days;
  }
}
