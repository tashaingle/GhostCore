import type {IntelligenceRule} from "../../types";
import {contextNow, groupBy, isoWeek} from "../../windows";
import {reviews} from "./shared";

const DAY = 86_400_000;
const WINDOW_DAYS = 7;

/**
 * A heads-up for 1- and 2-star reviews in the last week: one insight per app or place each
 * week, updated as more arrive. Answered Business Profile reviews are left out.
 */
export const lowRatingReviewsRule: IntelligenceRule = {
  id: "reviews.low_rating",
  name: "Low-rated reviews",
  description:
    "Flags 1- and 2-star reviews left in the last week on Google Play, the App Store or Google.",
  priority: 45,
  supportedProviders: ["google_play", "app_store", "google_business_profile"],
  evaluate(events, context) {
    const now = contextNow(context),
      since = now.getTime() - WINDOW_DAYS * DAY,
      low = reviews(events).filter(
        (r) => r.stars <= 2 && !r.replied && Date.parse(r.event.occurredAt) >= since,
      );
    return [...groupBy(low, (r) => r.target)].map(([target, items]) => {
      const first = items[0],
        ones = items.filter((r) => r.stars === 1).length,
        count = items.length,
        what = count === 1 ? `A ${first.stars}-star review` : `${count} low reviews`;
      return {
        title: `${what} on ${first.name} this week`,
        summary:
          count === 1
            ? `Someone left ${first.name} ${first.stars} star${first.stars === 1 ? "" : "s"} on ${first.store}${first.event.description ? `: "${first.event.description}"` : "."}`
            : `${first.name} had ${count} reviews of 1 or 2 stars on ${first.store} in the last ${WINDOW_DAYS} days${ones ? `, ${ones} of them 1 star` : ""}.`,
        severity: count >= 3 ? ("critical" as const) : ("warning" as const),
        confidence: Math.min(95, 80 + count * 3),
        explanation: `Reviews of 1 or 2 stars lower the rating people see before installing or visiting, and an unanswered one is visible to everyone who reads the reviews.`,
        recommendation: `Read the review${count === 1 ? "" : "s"} in ${first.reply} and reply where you can: a calm, helpful answer often wins people back. If several mention the same problem, fix that first.`,
        sourceEventIds: items.slice(0, 50).map((r) => r.event.id),
        fingerprintKey: `${target}:${isoWeek(now)}`,
        metadata: {target, lowReviews: count, oneStar: ones, store: first.store},
      };
    });
  },
};
