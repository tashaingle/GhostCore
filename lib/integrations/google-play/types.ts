export type PlayApp = {
  packageName: string;
  displayName: string;
  selected?: boolean;
};

export type GooglePlaySettings = {
  accountEmail?: string | null;
  configurationStatus?: "property_required" | "ready";
  apps?: PlayApp[];
  scopes?: string[];
  lastReviewSeconds?: Record<string, number>;
  lastSyncAt?: string;
  partialFailures?: number;
};

export type PlayReview = {
  reviewId: string;
  starRating: number;
  text: string;
  seconds: number;
  appVersionName?: string;
  /** The developer has answered it. */
  replied?: boolean;
};

export type CrashDay = {
  day: string;
  /** Share of people who hit a crash, from 0 to 1. */
  crashRate: number;
  distinctUsers?: number;
};
