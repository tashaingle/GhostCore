import "server-only";

/** Read scopes only. video.publish and video.upload are never requested. */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"] as const;

export const TIKTOK_LIMITS = {
  videos: 20,
  initialDays: 30,
  timeoutMs: 15000,
} as const;

export function tiktokEnv() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim(),
    clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim(),
    redirectUri = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (!clientKey || !clientSecret || !redirectUri)
    throw new Error("TikTok isn't set up on this site yet.");
  return {clientKey, clientSecret, redirectUri};
}
