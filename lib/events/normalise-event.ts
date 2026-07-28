import { eventInputSchema } from "./event-schema";
import type { NormalisedEventInput } from "@/types/events";
export function normaliseEvent(input: NormalisedEventInput): NormalisedEventInput {
  return eventInputSchema.parse({
    ...input, source: input.source.trim().toLowerCase(), eventType: input.eventType.trim().toLowerCase(),
    title: input.title.trim(), description: input.description?.trim() || null,
    occurredAt: new Date(input.occurredAt).toISOString(), externalId: input.externalId?.trim() || null,
    rawPayload: input.rawPayload ?? {}, metadata: input.metadata ?? {},
  });
}
