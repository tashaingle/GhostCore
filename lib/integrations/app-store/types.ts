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
  /** From Payments and Financial Reports. Turns on daily downloads. */
  vendorNumber?: string;
  /** Set when downloads use a second key with the Sales or Finance role. */
  reportsKeyId?: string;
  downloadsSyncedAt?: string;
  /** Why downloads couldn't be read on the last sync, in plain English. */
  downloadsError?: string | null;
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

/** One app's downloads on one day, from Apple's daily sales summary. */
export type DownloadDay = {
  appId: string;
  day: string;
  /** First-time downloads, free or paid. */
  downloads: number;
  redownloads: number;
  updates: number;
};
