import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {TikTokClient, TikTokError} from "./client";
import {TIKTOK_LIMITS} from "./config";
import {translateTikTokAccount, translateTikTokVideo} from "./translator";
import type {TikTokSettings, TikTokVideo} from "./types";

export class TikTokConnector implements IntegrationConnector {
  readonly provider = "tiktok";
  private error?: unknown;
  constructor(
    private client: TikTokClient,
    private settings: TikTokSettings,
    private now: () => Date = () => new Date(),
  ) {}
  connect = async () => ({ok: true});
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.profile(this.settings.scopes ?? ["user.info.basic"]);
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof TikTokError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    return translateTikTokVideo(record as unknown as TikTokVideo, context);
  }
  async sync(context: IntegrationSyncContext) {
    const scopes = this.settings.scopes ?? ["user.info.basic"],
      profile = await this.client.profile(scopes),
      videos = await this.client.videos(scopes),
      day = this.now().toISOString().slice(0, 10),
      ctx = {...context, receivedAt: context.receivedAt ?? this.now().toISOString()},
      cutoff = this.settings.lastVideoCreateTime
        ? this.settings.lastVideoCreateTime
        : Math.floor(this.now().getTime() / 1000) - TIKTOK_LIMITS.initialDays * 86400,
      events = [];
    const account = translateTikTokAccount(profile, ctx, day);
    if (account) events.push(account);
    let filtered = 0;
    for (const video of videos) {
      if (video.createTime <= cutoff) {
        filtered++;
        continue;
      }
      events.push(translateTikTokVideo(video, ctx));
    }
    const newest = videos.reduce((max, video) => Math.max(max, video.createTime), cutoff);
    return {
      received: videos.length + (account ? 1 : 0),
      events,
      filtered,
      credentials: this.client.credentialUpdate(),
      settings: {
        ...this.settings,
        openId: profile.openId,
        displayName: profile.displayName,
        username: profile.username,
        lastVideoCreateTime: newest,
        configurationStatus: "ready" as const,
      },
    };
  }
}
