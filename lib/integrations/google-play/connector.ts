import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {GooglePlayClient, GooglePlayError} from "./client";
import {PLAY_LIMITS} from "./config";
import {translatePlayCrash, translatePlayReview} from "./translator";
import {REPLY_CHECK_DAYS, translateReviewReply} from "../review-replies";
import type {CrashDay, GooglePlaySettings, PlayReview} from "./types";

type PlayRecord =
  | (PlayReview & {kind: "review"; packageName: string; displayName: string})
  | (CrashDay & {kind: "crash"; packageName: string; displayName: string});

export class GooglePlayConnector implements IntegrationConnector {
  readonly provider = "google_play";
  private error?: unknown;
  constructor(
    private client: GooglePlayClient,
    private settings: GooglePlaySettings,
    private now: () => Date = () => new Date(),
  ) {}
  connect = async () => ({ok: true});
  // One Google permission is shared by every Metric Mage connection for that account.
  // Disconnecting only removes this connection. People remove Metric Mage from their Google Account.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.apps();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof GooglePlayError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    const item = record as unknown as PlayRecord;
    return item.kind === "review"
      ? translatePlayReview(item, item, context)
      : translatePlayCrash(item, item, context);
  }
  async sync(context: IntegrationSyncContext) {
    const selected = (this.settings.apps ?? [])
      .filter((app) => app.selected)
      .slice(0, PLAY_LIMITS.apps);
    if (!selected.length)
      throw new GooglePlayError("permission", "Choose at least one Play app before syncing.");
    const now = this.now(),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      start = new Date(end);
    start.setUTCDate(start.getUTCDate() - PLAY_LIMITS.crashDays);
    const ctx = {...context, receivedAt: context.receivedAt ?? now.toISOString()},
      events = [],
      lastReviewSeconds = {...(this.settings.lastReviewSeconds ?? {})};
    let received = 0,
      filtered = 0,
      failures = 0,
      failure: unknown;
    const note = (error: unknown) => {
      failures++;
      failure = error;
      if (
        error instanceof GooglePlayError &&
        (error.kind === "permission" ||
          error.kind === "unauthorized" ||
          error.kind === "rate_limit")
      )
        throw error;
    };
    for (const app of selected) {
      try {
        const cutoff =
          lastReviewSeconds[app.packageName] ??
          Math.floor(now.getTime() / 1000) - PLAY_LIMITS.initialReviewDays * 86400;
        const replyStart = Math.floor(now.getTime() / 1000) - REPLY_CHECK_DAYS * 86400;
        let pageToken: string | undefined,
          newest = cutoff,
          kept = 0;
        for (
          let page = 0;
          page < PLAY_LIMITS.reviewPages && kept < PLAY_LIMITS.reviewsPerApp;
          page++
        ) {
          const batch = await this.client.reviews(app.packageName, pageToken);
          if (!batch.reviews.length) break;
          for (const review of batch.reviews) {
            received++;
            if (review.seconds <= cutoff) {
              // Already imported: note a reply to a recent low review, so its alert can clear.
              const reply =
                review.replied && review.starRating <= 2 && review.seconds >= replyStart
                  ? translateReviewReply(
                      {
                        source: "google_play",
                        idKey: "packageName",
                        id: app.packageName,
                        reviewId: review.reviewId,
                        starRating: review.starRating,
                        name: app.displayName,
                      },
                      ctx,
                    )
                  : null;
              if (reply) events.push(reply);
              else filtered++;
              continue;
            }
            const event = translatePlayReview(review, app, ctx);
            if (!event || kept >= PLAY_LIMITS.reviewsPerApp) {
              filtered++;
              continue;
            }
            events.push(event);
            kept++;
            if (review.seconds > newest) newest = review.seconds;
          }
          pageToken = batch.nextPageToken;
          const oldest = Math.min(...batch.reviews.map((review) => review.seconds));
          if (!pageToken || oldest <= Math.min(cutoff, replyStart)) break;
        }
        lastReviewSeconds[app.packageName] = newest;
      } catch (error) {
        note(error);
      }
      try {
        for (const day of await this.client.crashRates(app.packageName, start, end)) {
          received++;
          const event = translatePlayCrash(day, app, ctx);
          if (!event) {
            filtered++;
            continue;
          }
          events.push(event);
        }
      } catch (error) {
        note(error);
      }
    }
    if (failures && !events.length)
      throw failure instanceof Error
        ? failure
        : new GooglePlayError(
            "provider",
            "Google Play could not be read. Check this Google account can open the app, and that both Play APIs are turned on.",
          );
    return {
      received,
      events,
      filtered,
      credentials: this.client.credentialUpdate(),
      settings: {
        ...this.settings,
        lastReviewSeconds,
        lastSyncAt: now.toISOString(),
        partialFailures: failures,
      },
    };
  }
}
