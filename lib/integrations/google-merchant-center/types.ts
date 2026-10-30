export type MerchantAccount = {
  /** Digits only. */
  accountId: string;
  name: string;
  selected?: boolean;
};

export type MerchantCenterSettings = {
  accountEmail?: string | null;
  configurationStatus?: "property_required" | "ready";
  accounts?: MerchantAccount[];
  scopes?: string[];
  lastSyncAt?: string;
  partialFailures?: number;
};

export type ItemIssue = {
  code?: string;
  severity?: "NOT_IMPACTED" | "DEMOTED" | "DISAPPROVED" | string;
  attribute?: string;
  reportingContext?: string;
  description?: string;
  detail?: string;
  documentation?: string;
  documentationUri?: string;
  applicableCountries?: string[];
  /** Aggregate statuses only: how many products have it. */
  productCount?: string | number;
};

export type MerchantProduct = {
  name?: string;
  offerId?: string;
  /** v1 uses productAttributes; v1beta called it attributes. */
  productAttributes?: {title?: string; link?: string};
  attributes?: {title?: string; link?: string};
  productStatus?: {
    destinationStatuses?: {
      reportingContext?: string;
      approvedCountries?: string[];
      pendingCountries?: string[];
      disapprovedCountries?: string[];
    }[];
    itemLevelIssues?: ItemIssue[];
    googleExpirationDate?: string;
  };
};

export type AggregateStatus = {
  reportingContext?: string;
  country?: string;
  stats?: {
    activeCount?: string | number;
    pendingCount?: string | number;
    disapprovedCount?: string | number;
    expiringCount?: string | number;
  };
  itemLevelIssues?: ItemIssue[];
};

export type AccountIssue = {
  name?: string;
  title?: string;
  severity?: "CRITICAL" | "ERROR" | "SUGGESTION" | string;
  detail?: string;
  documentationUri?: string;
  impactedDestinations?: {
    reportingContext?: string;
    impacts?: {regionCode?: string; severity?: string}[];
  }[];
};

export type PerformanceDay = {
  day: string;
  /** ORGANIC is free listings; ADS is Shopping ads. */
  marketingMethod: "ORGANIC" | "ADS" | "OTHER";
  clicks: number;
  impressions: number;
};
