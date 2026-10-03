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
import {completeSevenDayRanges} from "./dates";
import type {GA4Snapshot} from "./schemas";
import {translateGA4Snapshot} from "./translator";
export type GoogleAnalyticsSettings = {
  propertyId?: string;
  propertyName?: string;
  accountId?: string;
  accountName?: string;
  timeZone?: string;
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
    return {received: 1, events, credentials: this.client.credentialUpdate()};
  }
}
