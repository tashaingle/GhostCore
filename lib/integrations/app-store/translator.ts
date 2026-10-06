import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {AppStoreReview} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function translateAppStoreReview(
  review: AppStoreReview,
  app: {appId: string; name: string},
  context: TranslationContext,
): NormalisedEventInput | null {
  const name = clean(app.name || app.appId, 80),
    stars = review.rating;
  if (!name || stars < 1 || stars > 5) return null;
  const title = clean(review.title, 80),
    body = clean(review.body, 160),
    excerpt = title && body ? `${title}: ${body}` : title || body;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "app_store",
    category: "customer",
    eventType: "app_store.review.received",
    title: `${stars === 1 ? "1-star review" : `${stars}-star review`} on ${name}`.slice(0, 200),
    description: excerpt.slice(0, 200) || null,
    severity: stars <= 2 ? "warning" : stars >= 4 ? "good" : "info",
    occurredAt: new Date(review.seconds * 1000).toISOString(),
    externalId: `app_store:review:${app.appId}:${review.reviewId}`,
    rawPayload: {},
    metadata: {
      appId: app.appId,
      reviewId: review.reviewId,
      starRating: stars,
      ...(review.territory ? {territory: review.territory} : {}),
      privacy: "excerpt_only",
    },
  };
}
