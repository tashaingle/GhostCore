import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {ActivityDay, BusinessReview} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

type Place = {location: string; title: string};

export function translateBusinessReview(
  review: BusinessReview,
  place: Place,
  context: TranslationContext,
): NormalisedEventInput | null {
  const name = clean(place.title, 80),
    stars = review.starRating;
  if (!name || stars < 1 || stars > 5) return null;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "google_business_profile",
    category: "customer",
    eventType: "google_business_profile.review.received",
    title: `${stars === 1 ? "1-star review" : `${stars}-star review`} on Google for ${name}`.slice(
      0,
      200,
    ),
    description: clean(review.comment, 160) || null,
    severity: stars <= 2 ? "warning" : stars >= 4 ? "good" : "info",
    occurredAt: new Date(review.seconds * 1000).toISOString(),
    externalId: `google_business_profile:review:${place.location}:${review.reviewId}`,
    rawPayload: {},
    metadata: {
      location: place.location,
      reviewId: review.reviewId,
      starRating: stars,
      replied: review.replied,
      privacy: "excerpt_only",
    },
  };
}

export function translateBusinessActivity(
  day: ActivityDay,
  place: Place,
  context: TranslationContext,
): NormalisedEventInput | null {
  const name = clean(place.title, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(day.day)) return null;
  const actions = day.calls + day.websiteClicks + day.directions,
    parts = [
      day.calls ? count(day.calls, "call", "calls") : "",
      day.websiteClicks ? count(day.websiteClicks, "website visit", "website visits") : "",
      day.directions ? count(day.directions, "directions request", "directions requests") : "",
    ].filter(Boolean);
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "google_business_profile",
    category: "marketing",
    eventType: "google_business_profile.activity.recorded",
    title: `${name} · ${count(day.views, "view", "views")} on Google`.slice(0, 200),
    description: parts.length ? `${parts.join(", ")}.` : "No calls, visits or directions.",
    severity: actions > 0 ? "good" : "info",
    occurredAt: `${day.day}T12:00:00.000Z`,
    externalId: `google_business_profile:activity:${place.location}:${day.day}`,
    rawPayload: {},
    metadata: {
      location: place.location,
      reportingDate: day.day,
      views: day.views,
      calls: day.calls,
      websiteClicks: day.websiteClicks,
      directions: day.directions,
      privacy: "aggregate_only",
    },
  };
}
