import type {IntegrationCapability, SyncSchedule} from "./connector";
export type ProviderId =
  | "github"
  | "google_analytics"
  | "google_search_console"
  | "gmail"
  | "outlook"
  | "google_calendar"
  | "stripe"
  | "shopify"
  | "meta_ads"
  | "meta_social"
  | "linkedin"
  | "manual"
  | "notion"
  | "slack";
export type ProviderDefinition = {
  id: ProviderId;
  displayName: string;
  icon: string;
  colour: string;
  category: string;
  oauth: boolean;
  sync: boolean;
  capabilities: readonly IntegrationCapability[];
  schedule: SyncSchedule;
  recommendedFrequency: string;
  connector:
    | "github"
    | "google_analytics"
    | "google_search_console"
    | "gmail"
    | "outlook"
    | "google_calendar"
    | "stripe"
    | "shopify"
    | "meta_ads"
    | "meta_social"
    | "linkedin"
    | "manual"
    | "notion"
    | "slack"
    | null;
  description?: string;
  healthSupport?: boolean;
  propertySelection?: boolean;
  oauthProvider?: string;
  oauthScopes?: string;
  callbackPath?: string;
  connectPath?: string;
  configurationPath?: string;
};
export const providerRegistry = {
  github: {
    id: "github",
    displayName: "GitHub",
    description:
      "Deployments, failed builds and releases, so you can see when a change affected your site.",
    icon: "GH",
    colour: "#24292f",
    category: "Development",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "webhooks", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "github",
    oauthProvider: "github",
    oauthScopes: "read:user repo",
    callbackPath: "/auth/github/callback",
    configurationPath: "/app/integrations/github/settings",
  },
  google_analytics: {
    id: "google_analytics",
    displayName: "Google Analytics 4",
    icon: "GA",
    colour: "#f9ab00",
    category: "Analytics",
    description: "Website visits and conversions, with a heads-up when traffic changes.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "daily",
    recommendedFrequency: "Daily",
    connector: "google_analytics",
    healthSupport: true,
    propertySelection: true,
    connectPath: "/api/integrations/google-analytics/connect",
    configurationPath: "/app/integrations/google-analytics/properties",
  },
  google_search_console: {
    id: "google_search_console",
    displayName: "Google Search Console",
    icon: "SC",
    colour: "#4285f4",
    category: "Marketing",
    description: "How you show up in Google: clicks, rankings and pages Google can't index.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "daily",
    recommendedFrequency: "Daily",
    connector: "google_search_console",
    healthSupport: true,
    propertySelection: true,
    connectPath: "/api/integrations/google-search-console/connect",
    configurationPath: "/app/integrations/google-search-console/properties",
  },
  gmail: {
    id: "gmail",
    displayName: "Gmail",
    icon: "GM",
    colour: "#ea4335",
    category: "Communication",
    description: "New emails and enquiries. Metric Mage reads subject lines, never full messages.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "gmail",
    connectPath: "/api/integrations/gmail/connect",
    configurationPath: "/app/integrations/gmail/settings",
  },
  outlook: {
    id: "outlook",
    displayName: "Outlook",
    icon: "OL",
    colour: "#0a64d8",
    category: "Communication",
    description:
      "New emails and enquiries from Outlook, Hotmail or Microsoft 365. Metric Mage reads subject lines, never full messages.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "outlook",
    connectPath: "/api/integrations/outlook/connect",
    configurationPath: "/app/integrations/outlook/settings",
  },
  google_calendar: {
    id: "google_calendar",
    displayName: "Google Calendar",
    icon: "GC",
    colour: "#4285f4",
    category: "Productivity",
    description: "Meetings and events from the calendars you choose.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "google_calendar",
    connectPath: "/api/integrations/google-calendar/connect",
    configurationPath: "/app/integrations/google-calendar/settings",
  },
  stripe: {
    id: "stripe",
    displayName: "Stripe",
    icon: "ST",
    colour: "#635bff",
    category: "Finance",
    description: "Payments, refunds, subscriptions, disputes and payouts. Read-only.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "webhooks", "read_only"],
    schedule: "webhook",
    recommendedFrequency: "Instantly",
    connector: "stripe",
    connectPath: "/api/integrations/stripe/connect",
    configurationPath: "/app/integrations/stripe/settings",
  },
  shopify: {
    id: "shopify",
    displayName: "Shopify",
    icon: "SH",
    colour: "#95bf47",
    category: "Commerce",
    description: "Orders, refunds, stock levels and discounts from your store. Read-only.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "shopify",
    connectPath: "/api/integrations/shopify/connect",
    configurationPath: "/app/integrations/shopify/settings",
  },
  meta_ads: {
    id: "meta_ads",
    displayName: "Meta Ads",
    icon: "MA",
    colour: "#0866ff",
    category: "Advertising",
    description: "Daily ad spend and results for your Facebook and Instagram ads. Read-only.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "daily",
    recommendedFrequency: "Daily",
    connector: "meta_ads",
    connectPath: "/api/integrations/meta-ads/connect",
    configurationPath: "/app/integrations/meta-ads/settings",
    healthSupport: true,
    propertySelection: true,
  },
  meta_social: {
    id: "meta_social",
    displayName: "Meta Social",
    icon: "MS",
    colour: "#1877f2",
    category: "Marketing",
    description: "Followers, reach and engagement for your Facebook Page and Instagram.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "daily",
    recommendedFrequency: "Daily",
    connector: "meta_social",
    connectPath: "/api/integrations/meta-social/connect",
    configurationPath: "/app/integrations/meta-social/settings",
    healthSupport: true,
    propertySelection: true,
  },
  linkedin: {
    id: "linkedin",
    displayName: "LinkedIn",
    icon: "LI",
    colour: "#0a66c2",
    category: "Marketing",
    description: "LinkedIn ad results and Company Page performance. Read-only.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "daily",
    recommendedFrequency: "Daily",
    connector: "linkedin",
    connectPath: "/api/integrations/linkedin/connect",
    configurationPath: "/app/integrations/linkedin/settings",
    healthSupport: true,
    propertySelection: true,
  },
  manual: {
    id: "manual",
    displayName: "Manual",
    icon: "MN",
    colour: "#52525b",
    category: "Internal",
    description: "Add sales, costs or leads by hand, or upload a spreadsheet.",
    oauth: false,
    sync: false,
    capabilities: ["manual", "read_write"],
    schedule: "manual",
    recommendedFrequency: "When you add data",
    connector: "manual",
    connectPath: "/api/integrations/manual/connect",
    configurationPath: "/app/integrations/manual",
  },
  notion: {
    id: "notion",
    displayName: "Notion",
    icon: "NO",
    colour: "#000000",
    category: "Productivity",
    description: "Changes in the Notion databases you choose, like tasks moving to done.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "notion",
    connectPath: "/api/integrations/notion/connect",
    configurationPath: "/app/integrations/notion/settings",
    healthSupport: true,
    propertySelection: true,
  },
  slack: {
    id: "slack",
    displayName: "Slack",
    icon: "SL",
    colour: "#4a154b",
    category: "Communication",
    description: "Activity from the Slack channels you choose.",
    oauth: true,
    sync: true,
    capabilities: ["oauth", "polling", "read_only"],
    schedule: "hourly",
    recommendedFrequency: "Hourly",
    connector: "slack",
    connectPath: "/api/integrations/slack/connect",
    configurationPath: "/app/integrations/slack/settings",
    healthSupport: true,
    propertySelection: true,
  },
} as const satisfies Record<ProviderId, ProviderDefinition>;
export const providers = Object.values(providerRegistry);
export function getProvider(id: string): ProviderDefinition | undefined {
  return providers.find((provider) => provider.id === id);
}
export function hasCapability(provider: ProviderDefinition, capability: IntegrationCapability) {
  return provider.capabilities.includes(capability);
}
