export type AppStoreApp = {
  appId: string;
  name: string;
  bundleId: string;
  selected?: boolean;
};

export type AppStoreSettings = {
  issuerId?: string;
  keyId?: string;
  configurationStatus?: "property_required" | "ready";
  apps?: AppStoreApp[];
  lastReviewSeconds?: Record<string, number>;
  lastSyncAt?: string;
  partialFailures?: number;
};

/** What is stored, encrypted, in place of an access token. */
export type AppStoreKey = {
  issuerId: string;
  keyId: string;
  privateKey: string;
};

export type AppStoreReview = {
  reviewId: string;
  rating: number;
  title: string;
  body: string;
  seconds: number;
  territory?: string;
  /** The developer has answered it. */
  replied?: boolean;
};
