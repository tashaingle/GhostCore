import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {GoogleAdsClient, GoogleAdsError} from "./client";
import {ADS_LIMITS} from "./config";
import {translateAdsDay, type AccountDay} from "./translator";
import type {CampaignDay, GoogleAdsSettings} from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A day "jumps" when it spends at least double the average of the account's other days, and over 20. */
export function markSpendJumps(days: AccountDay[]) {
  const spend = (d: AccountDay) =>
    Number(d.campaigns.reduce((t, c) => t + c.costMicros, 0n)) / 1_000_000;
  return days.map((day) => {
    const others = days.filter((d) => d !== day).map(spend),
      average = others.length >= 3 ? others.reduce((a, b) => a + b, 0) / others.length : null,
      value = spend(day);
    return {...day, spendJump: average !== null && value > 20 && value >= average * 2};
  });
}

export class GoogleAdsConnector implements IntegrationConnector {
  readonly provider = "google_ads";
  private error?: unknown;
  constructor(
    private client: GoogleAdsClient,
    private settings: GoogleAdsSettings,
    private now: () => Date = () => new Date(),
  ) {}
  connect = async () => ({ok: true});
  // People remove Metric Mage from their Google Account; disconnecting only forgets it here.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.accounts();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof GoogleAdsError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    return translateAdsDay(
      record as unknown as AccountDay,
      context,
      context.receivedAt.slice(0, 10),
    );
  }
  async sync(context: IntegrationSyncContext) {
    const selected = (this.settings.accounts ?? [])
      .filter((account) => account.selected)
      .slice(0, ADS_LIMITS.accounts);
    if (!selected.length)
      throw new GoogleAdsError(
        "permission",
        "Choose at least one Google Ads account before syncing.",
      );
    const now = this.now(),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
      start = new Date(end);
    start.setUTCDate(start.getUTCDate() - ADS_LIMITS.days + 1);
    const ctx = {...context, receivedAt: context.receivedAt ?? now.toISOString()},
      revision = iso(now),
      events = [];
    let received = 0,
      filtered = 0,
      failures = 0,
      failure: unknown;
    for (const account of selected) {
      let rows: CampaignDay[];
      try {
        rows = await this.client.campaignDays(account.customerId, iso(start), iso(end));
      } catch (error) {
        failures++;
        failure = error;
        if (
          error instanceof GoogleAdsError &&
          (error.kind === "unauthorized" || error.kind === "rate_limit")
        )
          throw error;
        continue;
      }
      received += rows.length;
      const byDay = new Map<string, CampaignDay[]>();
      for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
      const days = markSpendJumps(
        [...byDay].map(([day, campaigns]) => ({
          customerId: account.customerId,
          name: account.name,
          currency: account.currency,
          day,
          campaigns,
        })),
      );
      for (const day of days) {
        const event = translateAdsDay(day, ctx, revision, ADS_LIMITS.campaignsPerDay);
        if (event) events.push(event);
        else filtered++;
      }
    }
    if (failures && failures === selected.length)
      throw failure instanceof Error
        ? failure
        : new GoogleAdsError("provider", "Google Ads could not be read. Please try again.");
    return {
      received,
      events,
      filtered,
      credentials: this.client.credentialUpdate(),
      settings: {...this.settings, lastSyncAt: now.toISOString(), partialFailures: failures},
    };
  }
}
