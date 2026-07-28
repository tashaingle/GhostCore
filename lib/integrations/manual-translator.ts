import type { EventTranslator, RawProviderRecord } from "./connector";
import type { NormalisedEventInput } from "@/types/events";
import { normaliseEvent } from "@/lib/events/normalise-event";
export const manualTranslator: EventTranslator<RawProviderRecord> = {
  translate(record, context): NormalisedEventInput {
    return normaliseEvent({ ...(record as Omit<NormalisedEventInput,"organisationId"|"integrationId">),
      organisationId:context.organisationId, integrationId:context.integrationId });
  },
};
