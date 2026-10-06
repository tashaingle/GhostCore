export type BusinessLocation = {
  /** "accounts/123" */
  account: string;
  /** "locations/456" */
  location: string;
  title: string;
  address?: string;
  selected?: boolean;
};

export type BusinessProfileSettings = {
  accountEmail?: string | null;
  configurationStatus?: "property_required" | "ready";
  locations?: BusinessLocation[];
  scopes?: string[];
  lastReviewSeconds?: Record<string, number>;
  lastSyncAt?: string;
  partialFailures?: number;
};

export type BusinessReview = {
  reviewId: string;
  starRating: number;
  comment: string;
  seconds: number;
  replied: boolean;
};

export type ActivityDay = {
  day: string;
  views: number;
  calls: number;
  websiteClicks: number;
  directions: number;
};
