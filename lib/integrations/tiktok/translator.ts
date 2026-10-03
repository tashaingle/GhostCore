import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {TikTokProfile, TikTokVideo} from "./types";

const clean = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

export function translateTikTokAccount(
  profile: TikTokProfile,
  context: TranslationContext,
  day: string,
): NormalisedEventInput | null {
  if (profile.followerCount === undefined && profile.likesCount === undefined) return null;
  const name = clean(profile.displayName || profile.username || "TikTok");
  const followers =
    profile.followerCount === undefined
      ? ""
      : ` · ${profile.followerCount.toLocaleString("en-GB")} followers`;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "tiktok",
    category: "marketing",
    eventType: "tiktok.account.performance_recorded",
    title: `TikTok · ${name}${followers}`.slice(0, 200),
    severity: "info",
    occurredAt: `${day}T12:00:00.000Z`,
    externalId: `tiktok:account:${profile.openId}:${day}`,
    rawPayload: {},
    metadata: {
      openId: profile.openId,
      username: profile.username ?? null,
      reportingDate: day,
      followerCount: profile.followerCount ?? null,
      followingCount: profile.followingCount ?? null,
      likesCount: profile.likesCount ?? null,
      videoCount: profile.videoCount ?? null,
      privacy: "aggregate_only",
    },
  };
}

export function translateTikTokVideo(
  video: TikTokVideo,
  context: TranslationContext,
): NormalisedEventInput {
  const title = video.title ? clean(video.title) : "";
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "tiktok",
    category: "marketing",
    eventType: "tiktok.video.published",
    title: (title ? `Posted “${title}”` : "Posted a TikTok").slice(0, 200),
    severity: "info",
    occurredAt: new Date(video.createTime * 1000).toISOString(),
    externalId: `tiktok:video:${video.id}`,
    rawPayload: {},
    metadata: {
      videoId: video.id,
      ...(video.url ? {url: video.url} : {}),
      viewCount: video.viewCount ?? null,
      likeCount: video.likeCount ?? null,
      commentCount: video.commentCount ?? null,
      shareCount: video.shareCount ?? null,
    },
  };
}
