import "server-only";
import type {
  ConnectorOperationResult,
  ConnectorSyncResult,
  IntegrationConnector,
  IntegrationHealth,
  IntegrationSyncContext,
  TranslationContext,
} from "../connector";
import {GoogleAnalyticsClient} from "./client";
import {GoogleAnalyticsError} from "./errors";
import {completeSevenDayRanges, dateInTimeZone} from "./dates";
import type {GA4Snapshot} from "./schemas";
import {translateGA4Day, translateGA4Snapshot} from "./translator";
export type GoogleAnalyticsSettings = {
  propertyId?: string;
  propertyName?: string;
  accountId?: string;
  accountName?: string;
  timeZone?: string;
  /** Set once the first sync has fetched a year of daily visits. */
  dailyVisitsFrom?: string;
};
/** A year and a bit on the first sync, so the Stats year view has history; a month after that. */
export const DAILY_VISIT_DAYS = {initial: 400, regular: 30} as const;
const shiftDay = (day: string, days: number) => {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export class GoogleAnalyticsConnector implements IntegrationConnector<GA4Snapshot> {
  provider = "google_analytics";
  private lastHealthError: unknown;
  constructor(
    private client: GoogleAnalyticsClient,
    private settings: GoogleAnalyticsSettings,
    private now: () => Date = () => new Date(),
  ) {}
  async connect(): Promise<ConnectorOperationResult> {
    await this.client.discoverProperties();
    return {ok: true};
  }
  // Google grants one permission per Google account, shared by every Metric Mage connection that
  // uses it (Gmail, Calendar, Analytics, Search Console, in any organisation). Revoking it on
  // disconnect would cut off all of them, so disconnecting only deletes this connection's stored
  // sign-in. People can remove Metric Mage entirely from their Google Account's security settings.
  async disconnect(): Promise<ConnectorOperationResult> {
    return {ok: true};
  }
  async refresh(): Promise<ConnectorOperationResult> {
    if (!this.settings.propertyId) return {ok: false, message: "Choose a GA4 property."};
    await this.client.property(this.settings.propertyId);
    return {ok: true};
  }
  healthError() {
    return this.lastHealthError;
  }
  async healthCheck(): Promise<IntegrationHealth> {
    if (!this.settings.propertyId) return "unknown";
    try {
      await this.client.property(this.settings.propertyId);
      this.lastHealthError = undefined;
      return "healthy";
    } catch (error) {
      this.lastHealthError = error;
      return error instanceof GoogleAnalyticsError && error.kind === "unauthorized"
        ? "expired"
        : "error";
    }
  }
  translate(snapshot: GA4Snapshot, context: TranslationContext) {
    return translateGA4Snapshot(snapshot, context);
  }
  async sync(context: IntegrationSyncContext): Promise<ConnectorSyncResult> {
    const propertyId = this.settings.propertyId;
    if (!propertyId)
      throw new GoogleAnalyticsError("configuration", "Choose a GA4 property before syncing.");
    const property = await this.client.property(propertyId);
    const timeZone = property.timeZone || this.settings.timeZone || "UTC";
    const dates = completeSevenDayRanges(this.now(), timeZone);
    const reports = await this.client.reports(propertyId, dates);
    const snapshot: GA4Snapshot = {propertyId, timeZone, dates, ...reports};
    const translated = this.translate(snapshot, {
      ...context,
      receivedAt: context.receivedAt ?? this.now().toISOString(),
    });
    const events = translated ? (Array.isArray(translated) ? translated : [translated]) : [];
    // Visits per day, up to yesterday in the property's time zone. A failure here only skips them.
    const yesterday = shiftDay(dateInTimeZone(this.now(), timeZone), -1),
      initial = !this.settings.dailyVisitsFrom,
      from = shiftDay(
        yesterday,
        -(initial ? DAILY_VISIT_DAYS.initial : DAILY_VISIT_DAYS.regular) + 1,
      );
    let days: Awaited<ReturnType<GoogleAnalyticsClient["dailyVisits"]>> | null = null;
    try {
      days = await this.client.dailyVisits(propertyId, from, yesterday);
    } catch (error) {
      if (error instanceof GoogleAnalyticsError && error.kind === "unauthorized") throw error;
    }
    const ctx = {...context, receivedAt: context.receivedAt ?? this.now().toISOString()};
    for (const day of days ?? []) {
      const event = translateGA4Day({propertyId, ...day}, ctx);
      if (event) events.push(event);
    }
    return {
      received: 1 + (days?.length ?? 0),
      events,
      credentials: this.client.credentialUpdate(),
      ...(days && initial ? {settings: {...this.settings, dailyVisitsFrom: from}} : {}),
    };
  }
}
