/** Human-friendly labels for providers and event noise reduction. */

const providerNames: Record<string, string> = {
  github: "GitHub",
  google_analytics: "Google Analytics",
  google_search_console: "Search Console",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  shopify: "Shopify",
  meta_ads: "Meta Ads",
  linkedin: "LinkedIn",
  manual: "Manual",
  notion: "Notion",
  slack: "Slack",
};

export function providerLabel(id: string) {
  return providerNames[id] ?? id.replaceAll("_", " ");
}

/** Event types that clutter the default timeline for non-technical users. */
export const LOW_SIGNAL_EVENT_TYPES = new Set([
  "git.push",
  "github.push",
  "shopify.discount_created",
  "shopify.discount_disabled",
  "shopify.discount_expired",
]);

export function isLowSignalEventType(eventType: string) {
  return LOW_SIGNAL_EVENT_TYPES.has(eventType) || eventType.endsWith(".push");
}

export function humanEventLabel(source: string, category: string, eventType: string) {
  const provider = providerLabel(source);
  const type = eventType.includes(".")
    ? eventType.split(".").slice(1).join(" ").replaceAll("_", " ")
    : eventType.replaceAll("_", " ");
  return `${provider} · ${type}`;
}

export function configureIntegrationLabel(
  providerId: string,
  configurationRequired: boolean,
) {
  if (providerId === "slack") {
    return configurationRequired ? "Choose channels" : "Manage channels";
  }
  if (providerId === "gmail") {
    return configurationRequired ? "Mailbox settings" : "Settings";
  }
  if (providerId === "google_calendar") {
    return configurationRequired ? "Choose calendars" : "Calendars";
  }
  if (
    providerId === "google_analytics" ||
    providerId === "google_search_console" ||
    providerId === "meta_ads" ||
    providerId === "linkedin"
  ) {
    return configurationRequired ? "Choose account" : "Settings";
  }
  if (providerId === "notion") {
    return configurationRequired ? "Choose databases" : "Databases";
  }
  if (providerId === "stripe" || providerId === "shopify") {
    return configurationRequired ? "Finish setup" : "Settings";
  }
  return configurationRequired ? "Finish setup" : "Settings";
}
