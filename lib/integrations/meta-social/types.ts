export type SocialAsset = {
  kind: "facebook_page" | "instagram_account";
  id: string;
  name: string;
  /** Page id that owns an Instagram professional account, when kind is instagram. */
  pageId?: string;
  username?: string;
  followers?: number | null;
  selected?: boolean;
  accessState?: "available" | "disabled";
};

export type SocialMetric = {
  kind: "page_metric" | "instagram_metric" | "media_metric";
  platform: "facebook" | "instagram";
  assetId: string;
  assetName?: string;
  entityId: string;
  entityName?: string;
  date: string;
  metrics: Record<string, number | null>;
  mediaType?: string;
};

export type SocialRecord = SocialMetric;

export type MetaSocialSettings = {
  metaUserId?: string;
  metaUserName?: string;
  assets?: SocialAsset[];
  grantedPermissions?: string[];
  declinedPermissions?: string[];
  tokenIssuedAt?: string;
  graphApiVersion?: string;
  initialSyncComplete?: boolean;
  lastSyncAt?: string;
  lastSyncMode?: string;
  fingerprints?: Record<string, string>;
  configurationStatus?: string;
};
