import type {TranslationContext} from "./connector";
import type {NormalisedEventInput} from "@/types/events";

/** How far back each sync looks for replies to low reviews it already imported. */
export const REPLY_CHECK_DAYS = 7;

/**
 * Records that a low review now has a reply. Review events are stored once and never updated,
 * so a reply made after the review was imported arrives as its own event. Its external id makes
 * it a one-off, however many syncs see the reply.
 */
export function translateReviewReply(
  input: {
    source: "google_play" | "app_store" | "google_business_profile";
    idKey: "packageName" | "appId" | "location";
    id: string;
    reviewId: string;
    starRating: number;
    name: string;
  },
  context: TranslationContext,
): NormalisedEventInput | null {
  if (!input.id || !input.reviewId || input.starRating < 1 || input.starRating > 5) return null;
  const name =
    input.name
      .replace(/[\u0000-\u001f\u007f<>]/g, " ")
      .trim()
      .slice(0, 80) || input.id;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: input.source,
    category: "customer",
    eventType: `${input.source}.review.replied`,
    title: `Replied to a ${input.starRating}-star review on ${name}`.slice(0, 200),
    description: null,
    severity: "good",
    occurredAt: context.receivedAt,
    externalId: `${input.source}:review_reply:${input.id}:${input.reviewId}`,
    rawPayload: {},
    metadata: {[input.idKey]: input.id, reviewId: input.reviewId, starRating: input.starRating},
  };
}
