import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {CrashDay, PlayReview} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function crashPercent(rate: number) {
  const pct = rate * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function translatePlayReview(
  review: PlayReview,
  app: {packageName: string; displayName: string},
  context: TranslationContext,
): NormalisedEventInput | null {
  const name = clean(app.displayName || app.packageName, 80);
  const excerpt = clean(review.text, 160);
  const stars = review.starRating;
  if (!name || stars < 1 || stars > 5) return null;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "google_play",
    category: "customer",
    eventType: "google_play.review.received",
    title: `${stars === 1 ? "1-star review" : `${stars}-star review`} on ${name}`.slice(0, 200),
    description: excerpt || null,
    severity: stars <= 2 ? "warning" : stars >= 4 ? "good" : "info",
    occurredAt: new Date(review.seconds * 1000).toISOString(),
    externalId: `google_play:review:${app.packageName}:${review.reviewId}`,
    rawPayload: {},
    metadata: {
      packageName: app.packageName,
      reviewId: review.reviewId,
      starRating: stars,
      replied: Boolean(review.replied),
      ...(review.appVersionName ? {appVersionName: clean(review.appVersionName, 40)} : {}),
      privacy: "excerpt_only",
    },
  };
}

export function translatePlayCrash(
  day: CrashDay,
  app: {packageName: string; displayName: string},
  context: TranslationContext,
): NormalisedEventInput | null {
  const name = clean(app.displayName || app.packageName, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(day.day)) return null;
  const quiet = day.crashRate === 0;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "google_play",
    category: "operations",
    eventType: "google_play.stability.recorded",
    title: (quiet
      ? `${name} · no crashes reported`
      : `${name} · ${crashPercent(day.crashRate)} of people hit a crash`
    ).slice(0, 200),
    description:
      day.distinctUsers === undefined
        ? null
        : `Based on ${Math.round(day.distinctUsers).toLocaleString("en-GB")} people using the app.`,
    severity: day.crashRate >= 0.01 ? "warning" : "info",
    occurredAt: `${day.day}T12:00:00.000Z`,
    externalId: `google_play:crash:${app.packageName}:${day.day}`,
    rawPayload: {},
    metadata: {
      packageName: app.packageName,
      reportingDate: day.day,
      crashRate: day.crashRate,
      distinctUsers: day.distinctUsers ?? null,
      privacy: "aggregate_only",
    },
  };
}
