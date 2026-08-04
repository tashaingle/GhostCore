import "server-only";

/** Graph API version shared with Meta Ads unless overridden. */
export const META_SOCIAL_DEFAULT_VERSION = "v25.0";

/**
 * Default OAuth scopes for organic Facebook Pages.
 *
 * Meta returns "Invalid Scopes" to developers when the app has not added the
 * matching product/use-case permission in the App Dashboard — even if the
 * permission name is valid in Meta's docs. A typical Meta Ads app already
 * supports Page list/engagement; Instagram scopes need the Instagram product.
 *
 * Override with META_SOCIAL_SCOPES (comma-separated) after enabling products:
 * pages_show_list,pages_read_engagement,pages_read_user_content,instagram_basic,instagram_manage_insights,read_insights,business_management
 */
export const META_SOCIAL_PERMISSIONS_DEFAULT = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "business_management",
] as const;

/** Full organic set once Instagram Graph API + Page content are enabled on the app. */
export const META_SOCIAL_PERMISSIONS_WITH_INSTAGRAM = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_insights",
  "read_insights",
  "business_management",
] as const;

export const META_SOCIAL_PERMISSIONS = META_SOCIAL_PERMISSIONS_DEFAULT;

export function metaSocialPermissions(): string[] {
  const override = process.env.META_SOCIAL_SCOPES?.trim();
  if (override) {
    return override
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.META_SOCIAL_INCLUDE_INSTAGRAM === "true") {
    return [...META_SOCIAL_PERMISSIONS_WITH_INSTAGRAM];
  }
  return [...META_SOCIAL_PERMISSIONS_DEFAULT];
}

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
