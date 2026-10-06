export type AdsAccount = {
  /** Ten digits, no dashes. */
  customerId: string;
  name: string;
  currency: string;
  selected?: boolean;
};

export type GoogleAdsSettings = {
  accountEmail?: string | null;
  configurationStatus?: "property_required" | "ready";
  accounts?: AdsAccount[];
  scopes?: string[];
  lastSyncAt?: string;
  partialFailures?: number;
};

export type CampaignDay = {
  campaignId: string;
  name: string;
  day: string;
  costMicros: bigint;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
};
