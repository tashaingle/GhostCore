import "server-only";
import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  STRIPE_MAX_EVENTS,
  STRIPE_MAX_PAGES,
  STRIPE_MAX_RUNTIME_MS,
  STRIPE_MAX_TYPES_PER_REQUEST,
  STRIPE_SUPPORTED_EVENTS,
  stripeEnvironment,
} from "./config";
import {safeStripeError} from "./errors";

export function stripeClient(secretKey?: string) {
  return new Stripe(secretKey ?? stripeEnvironment().secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 15_000,
    telemetry: false,
  });
}

export type StripeEventPage = {
  events: Stripe.Event[];
  pages: number;
  truncated: boolean;
};

function chunkTypes<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size) as T[]);
  }
  return chunks;
}

export async function listStripeEvents(
  accountId: string,
  createdGte: number,
): Promise<StripeEventPage> {
  const client = stripeClient();
  const byId = new Map<string, Stripe.Event>();
  let pages = 0;
  let truncated = false;
  const started = Date.now();

  try {
    const typeChunks = chunkTypes(
      STRIPE_SUPPORTED_EVENTS,
      STRIPE_MAX_TYPES_PER_REQUEST,
    );

    for (const types of typeChunks) {
      if (
        byId.size >= STRIPE_MAX_EVENTS ||
        Date.now() - started >= STRIPE_MAX_RUNTIME_MS
      ) {
        truncated = true;
        break;
      }

      let startingAfter: string | undefined;
      let chunkPages = 0;

      while (
        chunkPages < STRIPE_MAX_PAGES &&
        byId.size < STRIPE_MAX_EVENTS &&
        Date.now() - started < STRIPE_MAX_RUNTIME_MS
      ) {
        const page = await client.events.list(
          {
            created: {gte: createdGte},
            limit: 100,
            types: [...types],
            ...(startingAfter ? {starting_after: startingAfter} : {}),
          },
          {stripeAccount: accountId},
        );

        pages++;
        chunkPages++;
        for (const event of page.data) {
          byId.set(event.id, event);
        }

        if (!page.has_more || !page.data.length) break;
        startingAfter = page.data.at(-1)?.id;
        if (!startingAfter) break;
      }

      if (chunkPages >= STRIPE_MAX_PAGES) truncated = true;
    }

    truncated =
      truncated ||
      byId.size >= STRIPE_MAX_EVENTS ||
      Date.now() - started >= STRIPE_MAX_RUNTIME_MS;

    const events = [...byId.values()]
      .sort((a, b) => a.created - b.created)
      .slice(0, STRIPE_MAX_EVENTS);

    return {events, pages, truncated};
  } catch (error) {
    throw safeStripeError(error);
  }
}
