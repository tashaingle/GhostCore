import type {IntelligenceRule} from "../../types";
import {contextNow, groupBy, isoWeek} from "../../windows";
import {reviews} from "./shared";

const DAY = 86_400_000;
const WINDOW_DAYS = 14;
const MIN_REVIEWS = 5;
const DROP = 0.5;

/** Compares the average star rating of the last two weeks with the two weeks before. */
export const ratingDropRule: IntelligenceRule = {
  id: "reviews.rating_drop",
  name: "Average rating falling",
  description: "Flags when an app's or place's average review rating drops by half a star or more.",
  priority: 46,
  supportedProviders: ["google_play", "app_store", "google_business_profile"],
  evaluate(events, context) {
    const now = contextNow(context).getTime(),
      currentStart = now - WINDOW_DAYS * DAY,
      previousStart = currentStart - WINDOW_DAYS * DAY,
      average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    return [...groupBy(reviews(events), (r) => r.target)].flatMap(([target, items]) => {
      const at = (r: (typeof items)[number]) => Date.parse(r.event.occurredAt),
        current = items.filter((r) => at(r) >= currentStart && at(r) < now),
        previous = items.filter((r) => at(r) >= previousStart && at(r) < currentStart);
      if (current.length < MIN_REVIEWS || previous.length < MIN_REVIEWS) return [];
      const was = average(previous.map((r) => r.stars)),
        is = average(current.map((r) => r.stars));
      if (was - is < DROP) return [];
      const name = items[0].name,
        fmt = (n: number) => n.toFixed(1);
      return [
        {
          title: `${name}'s rating fell from ${fmt(was)} to ${fmt(is)} stars`,
          summary: `New reviews of ${name} on ${items[0].store} averaged ${fmt(is)} stars over the last ${WINDOW_DAYS} days, down from ${fmt(was)} the ${WINDOW_DAYS} days before.`,
          severity: was - is >= 1 ? ("critical" as const) : ("warning" as const),
          confidence: Math.min(90, 60 + current.length * 2),
          explanation: `Based on ${current.length} recent reviews and ${previous.length} before them.`,
          recommendation:
            "Look for what changed: a new release, a price change or a service problem. The low reviews usually say what it is.",
          sourceEventIds: current.slice(0, 50).map((r) => r.event.id),
          fingerprintKey: `${target}:${isoWeek(new Date(now))}`,
          metadata: {target, previousAverage: was, currentAverage: is, reviews: current.length},
        },
      ];
    });
  },
};
