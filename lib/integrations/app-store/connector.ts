import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {AppStoreClient, AppStoreError} from "./client";
import {APP_STORE_LIMITS} from "./config";
import {translateAppStoreDownloads, translateAppStoreReview} from "./translator";
import {REPLY_CHECK_DAYS, translateReviewReply} from "../review-replies";
import type {AppStoreReview, AppStoreSettings} from "./types";

type AppStoreRecord = AppStoreReview & {appId: string; name: string};

export class AppStoreConnector implements IntegrationConnector {
  readonly provider = "app_store";
  private error?: unknown;
  constructor(
    private client: AppStoreClient,
    private settings: AppStoreSettings,
    private now: () => Date = () => new Date(),
    /** A second key for sales reports, when the main key's role can't read them. */
    private reportsClient: AppStoreClient = client,
  ) {}
  connect = async () => ({ok: true});
  // The key lives in App Store Connect. Disconnecting only forgets it here; people revoke it there.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.apps();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof AppStoreError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    const item = record as unknown as AppStoreRecord;
    return translateAppStoreReview(item, item, context);
  }
  async sync(context: IntegrationSyncContext) {
    const selected = (this.settings.apps ?? [])
      .filter((app) => app.selected)
      .slice(0, APP_STORE_LIMITS.apps);
    if (!selected.length)
      throw new AppStoreError("permission", "Choose at least one App Store app before syncing.");
    const now = this.now(),
      ctx = {...context, receivedAt: context.receivedAt ?? now.toISOString()},
      events = [],
      lastReviewSeconds = {...(this.settings.lastReviewSeconds ?? {})};
    let received = 0,
      filtered = 0,
      failures = 0,
      failure: unknown;
    for (const app of selected) {
      try {
        const cutoff =
          lastReviewSeconds[app.appId] ??
          Math.floor(now.getTime() / 1000) - APP_STORE_LIMITS.initialReviewDays * 86400;
        const replyStart = Math.floor(now.getTime() / 1000) - REPLY_CHECK_DAYS * 86400;
        let next: string | undefined,
          newest = cutoff,
          kept = 0;
        for (
          let page = 0;
          page < APP_STORE_LIMITS.reviewPages && kept < APP_STORE_LIMITS.reviewsPerApp;
          page++
        ) {
          const batch = await this.client.reviews(app.appId, next);
          if (!batch.reviews.length) break;
          for (const review of batch.reviews) {
            received++;
            if (review.seconds <= cutoff) {
              // Already imported: note a reply to a recent low review, so its alert can clear.
              const reply =
                review.replied && review.rating <= 2 && review.seconds >= replyStart
                  ? translateReviewReply(
                      {
                        source: "app_store",
                        idKey: "appId",
                        id: app.appId,
                        reviewId: review.reviewId,
                        starRating: review.rating,
                        name: app.name,
                      },
                      ctx,
                    )
                  : null;
              if (reply) events.push(reply);
              else filtered++;
              continue;
            }
            const event = translateAppStoreReview(review, app, ctx);
            if (!event || kept >= APP_STORE_LIMITS.reviewsPerApp) {
              filtered++;
              continue;
            }
            events.push(event);
            kept++;
            if (review.seconds > newest) newest = review.seconds;
          }
          next = batch.next;
          const oldest = Math.min(...batch.reviews.map((review) => review.seconds));
          if (!next || oldest <= Math.min(cutoff, replyStart)) break;
        }
        lastReviewSeconds[app.appId] = newest;
      } catch (error) {
        failures++;
        failure = error;
        if (
          error instanceof AppStoreError &&
          (error.kind === "permission" ||
            error.kind === "unauthorized" ||
            error.kind === "rate_limit")
        )
          throw error;
      }
    }
    const downloads = this.settings.vendorNumber
      ? await this.downloads(this.settings.vendorNumber, selected, ctx, now)
      : null;
    if (downloads) {
      received += downloads.received;
      filtered += downloads.filtered;
      events.push(...downloads.events);
    }
    if (failures && !events.length)
      throw failure instanceof Error
        ? failure
        : new AppStoreError("provider", "The App Store could not be read. Please try again.");
    return {
      received,
      events,
      filtered,
      settings: {
        ...this.settings,
        lastReviewSeconds,
        lastSyncAt: now.toISOString(),
        partialFailures: failures,
        ...(downloads
          ? {
              downloadsError: downloads.error,
              ...(downloads.error ? {} : {downloadsSyncedAt: now.toISOString()}),
            }
          : {}),
      },
    };
  }
  /**
   * Daily downloads for the chosen apps: a month back on the first sync, then the last week, so
   * reports Apple publishes late are still picked up. A problem here never stops reviews syncing.
   */
  private async downloads(
    vendorNumber: string,
    apps: {appId: string; name: string}[],
    ctx: TranslationContext,
    now: Date,
  ) {
    const days = this.settings.downloadsSyncedAt
        ? APP_STORE_LIMITS.downloadDays
        : APP_STORE_LIMITS.initialDownloadDays,
      byId = new Map(apps.map((app) => [app.appId, app])),
      events = [];
    let received = 0,
      filtered = 0,
      error: string | null = null;
    for (let back = 1; back <= days; back++) {
      const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back),
      )
        .toISOString()
        .slice(0, 10);
      try {
        for (const row of await this.reportsClient.downloads(vendorNumber, day)) {
          received++;
          const app = byId.get(row.appId),
            event = app ? translateAppStoreDownloads(row, app, ctx) : null;
          if (event) events.push(event);
          else filtered++;
        }
      } catch (problem) {
        error =
          problem instanceof Error ? problem.message : "Downloads couldn't be read from Apple.";
        break;
      }
    }
    return {events, received, filtered, error};
  }
}
