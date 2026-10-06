import type {IntelligenceEvent} from "../../types";
import {metadataString} from "../../windows";

/** Review events from the store connections, with the place they were left. */
export const REVIEW_SOURCES = {
  "google_play.review.received": {store: "Google Play", key: "packageName", reply: "Play Console"},
  "app_store.review.received": {store: "the App Store", key: "appId", reply: "App Store Connect"},
  "google_business_profile.review.received": {
    store: "Google",
    key: "location",
    reply: "your Business Profile",
  },
} as const;

export type Review = {
  event: IntelligenceEvent;
  /** Store plus app or location id, so one app's reviews are judged together. */
  target: string;
  name: string;
  store: string;
  reply: string;
  stars: number;
  replied: boolean;
};

export function reviews(events: IntelligenceEvent[]): Review[] {
  return events.flatMap((event) => {
    const source = REVIEW_SOURCES[event.eventType as keyof typeof REVIEW_SOURCES];
    if (!source) return [];
    const id = metadataString(event.metadata, source.key),
      stars = event.metadata.starRating;
    if (!id || typeof stars !== "number" || stars < 1 || stars > 5) return [];
    // Titles read "2-star review on Ghost" or "… on Google for Ghost Café".
    const name = /review on (?:Google for )?(.+)$/.exec(event.title)?.[1]?.trim() || id;
    return [
      {
        event,
        target: `${event.source}:${id}`,
        name,
        store: source.store,
        reply: source.reply,
        stars,
        replied: event.metadata.replied === true,
      },
    ];
  });
}
