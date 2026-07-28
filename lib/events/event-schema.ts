import { z } from "zod";
import { EVENT_CATEGORIES, EVENT_SEVERITIES } from "@/types/events";
const jsonRecord = z.record(z.string(), z.unknown());
export const eventInputSchema = z.object({
  organisationId: z.uuid(), integrationId: z.uuid().nullable().optional(),
  source: z.string().trim().min(1).max(80), category: z.enum(EVENT_CATEGORIES),
  eventType: z.string().trim().min(1).max(120).regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dots, underscores or hyphens."),
  title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).nullable().optional(),
  severity: z.enum(EVENT_SEVERITIES), occurredAt: z.iso.datetime({ offset: true }),
  externalId: z.string().trim().max(255).nullable().optional(), rawPayload: jsonRecord.optional(), metadata: jsonRecord.optional(),
});
export function parseJsonObject(value: string, label: string) {
  if (!value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return jsonRecord.parse(parsed);
  } catch { throw new Error(`${label} must be a valid JSON object.`); }
}
