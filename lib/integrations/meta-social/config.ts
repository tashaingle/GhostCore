import "server-only";

/** Graph API version shared with Meta Ads unless overridden. */
export const META_SOCIAL_DEFAULT_VERSION = "v25.0";

/**
 * Organic Facebook Page + Instagram professional account permissions only.
 * No ads write scopes. App Review must request Advanced Access for each.
 */
export const META_SOCIAL_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
] as const;

export const META_SOCIAL_LIMITS = {
  pages: 20,
  media: 25,
  initialDays: 28,
  reconcileDays: 7,
  requestPages: 5,
  requests: 80,
  runtimeMs: 45_000,
  rows: 2_000,
} as const;

/** Facebook Page Insights metrics (period=day) that are widely available. */
export const FB_PAGE_DAY_METRICS = [
  "page_impressions",
  "page_impressions_unique",
  "page_post_engagements",
  "page_follows",
  "page_daily_follows",
  "page_video_views",
] as const;

/** Instagram user insights (period=day). follower_count is lifetime on profile. */
export const IG_USER_DAY_METRICS = [
  "impressions",
  "reach",
  "profile_views",
  "website_clicks",
  "accounts_engaged",
  "total_interactions",
] as const;

export function metaSocialEnv() {
  const appId = process.env.META_APP_ID ?? process.env.META_SOCIAL_APP_ID;
  const appSecret = process.env.META_APP_SECRET ?? process.env.META_SOCIAL_APP_SECRET;
  const redirectUri =
    process.env.META_SOCIAL_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/integrations/meta-social/callback`;
  const version =
    process.env.META_SOCIAL_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    META_SOCIAL_DEFAULT_VERSION;
  if (!appId || !appSecret) throw new Error("Meta Social OAuth is not configured (META_APP_ID / META_APP_SECRET).");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_SOCIAL_GRAPH_API_VERSION must look like v25.0.");
  return {appId, appSecret, redirectUri, version};
}
