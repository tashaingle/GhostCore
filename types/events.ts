export const EVENT_CATEGORIES = ["marketing","sales","finance","customer","operations","website","development","communication","calendar","security","other"] as const;
export const EVENT_SEVERITIES = ["good","info","warning","critical"] as const;
export const INTEGRATION_STATUSES = ["connected","disconnected","error","syncing","expired"] as const;
export const ORGANISATION_ROLES = ["owner","admin","member","viewer"] as const;
export const SUPPORTED_PROVIDERS = ["google_analytics","google_search_console","gmail","google_calendar","stripe","shopify","meta_ads","github","manual"] as const;
export type EventCategory = typeof EVENT_CATEGORIES[number];
export type EventSeverity = typeof EVENT_SEVERITIES[number];
export type IntegrationStatus = typeof INTEGRATION_STATUSES[number];
export type OrganisationRole = typeof ORGANISATION_ROLES[number];
export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

export type NormalisedEventInput = {
  organisationId: string;
  integrationId?: string | null;
  source: string;
  category: EventCategory;
  eventType: string;
  title: string;
  description?: string | null;
  severity: EventSeverity;
  occurredAt: string;
  externalId?: string | null;
  rawPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type EventRow = {
  id: string; organisation_id: string; integration_id: string | null; source: string;
  category: EventCategory; event_type: string; title: string; description: string | null;
  severity: EventSeverity; occurred_at: string; external_id: string | null;
  raw_payload: Record<string, unknown>; metadata: Record<string, unknown>; created_at: string;
};
