import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {BusinessProfileClient, BusinessProfileError} from "./client";
import {BUSINESS_PROFILE_LIMITS} from "./config";
import {translateBusinessActivity, translateBusinessReview} from "./translator";
import {REPLY_CHECK_DAYS, translateReviewReply} from "../review-replies";
import type {ActivityDay, BusinessProfileSettings, BusinessReview} from "./types";

type BusinessRecord =
  | (BusinessReview & {kind: "review"; location: string; title: string})
  | (ActivityDay & {kind: "activity"; location: string; title: string});

export class BusinessProfileConnector implements IntegrationConnector {
  readonly provider = "google_business_profile";
  private error?: unknown;
  constructor(
    private client: BusinessProfileClient,
    private settings: BusinessProfileSettings,
    private now: () => Date = () => new Date(),
  ) {}
  connect = async () => ({ok: true});
  // People remove Metric Mage from their Google Account; disconnecting only forgets it here.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.locations();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof BusinessProfileError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    const item = record as unknown as BusinessRecord;
    return item.kind === "review"
      ? translateBusinessReview(item, item, context)
      : translateBusinessActivity(item, item, context);
  }
  async sync(context: IntegrationSyncContext) {
    const selected = (this.settings.locations ?? [])
      .filter((place) => place.selected)
      .slice(0, BUSINESS_PROFILE_LIMITS.locations);
    if (!selected.length)
      throw new BusinessProfileError(
        "permission",
        "Choose at least one Business Profile location before syncing.",
      );
    const now = this.now(),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
      start = new Date(end);
    start.setUTCDate(start.getUTCDate() - BUSINESS_PROFILE_LIMITS.activityDays + 1);
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
        error instanceof BusinessProfileError &&
        (error.kind === "permission" ||
          error.kind === "unauthorized" ||
          error.kind === "rate_limit")
      )
        throw error;
    };
    for (const place of selected) {
      try {
        const cutoff =
          lastReviewSeconds[place.location] ??
          Math.floor(now.getTime() / 1000) - BUSINESS_PROFILE_LIMITS.initialReviewDays * 86400;
        const replyStart = Math.floor(now.getTime() / 1000) - REPLY_CHECK_DAYS * 86400,
          // Updates can move a review between pages while they are read.
          seen = new Set<string>();
        let pageToken: string | undefined,
          newest = cutoff,
          kept = 0;
        for (
          let page = 0;
          page < BUSINESS_PROFILE_LIMITS.reviewPages &&
          kept < BUSINESS_PROFILE_LIMITS.reviewsPerLocation;
          page++
        ) {
          const batch = await this.client.reviews(place.account, place.location, pageToken);
          if (!batch.reviews.length) break;
          for (const review of batch.reviews) {
            if (seen.has(review.reviewId)) continue;
            seen.add(review.reviewId);
            received++;
            if (review.seconds <= cutoff) {
              // Already imported: note a reply to a recent low review, so its alert can clear.
              const reply =
                review.replied && review.starRating <= 2 && review.seconds >= replyStart
                  ? translateReviewReply(
                      {
                        source: "google_business_profile",
                        idKey: "location",
                        id: place.location,
                        reviewId: review.reviewId,
                        starRating: review.starRating,
                        name: place.title,
                      },
                      ctx,
                    )
                  : null;
              if (reply) events.push(reply);
              else filtered++;
              continue;
            }
            const event = translateBusinessReview(review, place, ctx);
            if (!event || kept >= BUSINESS_PROFILE_LIMITS.reviewsPerLocation) {
              filtered++;
              continue;
            }
            events.push(event);
            kept++;
            if (review.seconds > newest) newest = review.seconds;
          }
          pageToken = batch.nextPageToken;
          // Google sorts by last update, and a reply updates a review, so read both pages.
          if (!pageToken) break;
        }
        lastReviewSeconds[place.location] = newest;
      } catch (error) {
        note(error);
      }
      try {
        for (const day of await this.client.activity(place.location, start, end)) {
          received++;
          const event = translateBusinessActivity(day, place, ctx);
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
        : new BusinessProfileError(
            "provider",
            "Google Business Profile could not be read. Please try again.",
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
