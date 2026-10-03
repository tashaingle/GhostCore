import "server-only";
import {z} from "zod";
import type {ConnectorCredentialUpdate} from "../connector";
import {TIKTOK_LIMITS} from "./config";
import {refreshTikTokToken} from "./oauth";
import type {TikTokProfile, TikTokVideo} from "./types";

export type TikTokErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "unavailable" | "malformed";

export class TikTokError extends Error {
  constructor(
    public kind: TikTokErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const errorSchema = z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }),
  envelope = z.object({
    data: z.record(z.string(), z.unknown()).optional(),
    error: z.union([errorSchema, z.string()]).optional(),
  });

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tiktokUrl(value: unknown) {
  return typeof value === "string" && /^https:\/\/(www|vm)\.tiktok\.com\//.test(value)
    ? value
    : undefined;
}

export class TikTokClient {
  private access: string;
  private refreshToken?: string;
  private expiry?: string;
  private updated?: ConnectorCredentialUpdate;
  constructor(
    credentials: {accessToken: string; refreshToken?: string; expiresAt?: string},
    private request: typeof fetch = fetch,
  ) {
    this.access = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.expiry = credentials.expiresAt;
  }
  credentialUpdate() {
    return this.updated;
  }
  private async ensureToken() {
    if (!this.expiry || new Date(this.expiry).getTime() > Date.now() + 120000) return;
    if (!this.refreshToken)
      throw new TikTokError("unauthorized", "TikTok authorization has expired. Reconnect TikTok.");
    let next: Awaited<ReturnType<typeof refreshTikTokToken>>;
    try {
      next = await refreshTikTokToken(this.refreshToken);
    } catch {
      throw new TikTokError("unauthorized", "TikTok authorization has expired. Reconnect TikTok.");
    }
    this.access = next.access_token;
    this.refreshToken = next.refresh_token;
    this.expiry = new Date(Date.now() + next.expires_in * 1000).toISOString();
    this.updated = {
      accessToken: this.access,
      refreshToken: this.refreshToken,
      expiresAt: this.expiry,
    };
  }
  private async call(url: string, init: RequestInit) {
    await this.ensureToken();
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.access}`,
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(TIKTOK_LIMITS.timeoutMs),
      });
    } catch {
      throw new TikTokError("unavailable", "TikTok could not be reached. Try again shortly.");
    }
    const body = envelope.safeParse(await response.json().catch(() => null));
    const code =
      response.status === 401
        ? "access_token_invalid"
        : typeof body.data?.error === "string"
          ? body.data.error
          : (body.data?.error?.code ?? "");
    if (code === "access_token_invalid" || code === "invalid_grant")
      throw new TikTokError(
        "unauthorized",
        "TikTok authorization has expired. Reconnect TikTok.",
        response.status,
      );
    if (code === "scope_not_authorized" || code === "scope_permission_missed")
      throw new TikTokError(
        "permission",
        "TikTok has not granted that read permission yet.",
        response.status,
      );
    if (code === "rate_limit_exceeded" || response.status === 429)
      throw new TikTokError(
        "rate_limit",
        "TikTok is rate limiting requests. Sync will retry.",
        response.status,
      );
    if (!response.ok || !body.success || (code && code !== "ok"))
      throw new TikTokError(
        "unavailable",
        "TikTok could not be reached. Try again shortly.",
        response.status,
      );
    return body.data.data ?? {};
  }
  async profile(scopes: string[]): Promise<TikTokProfile> {
    const basic = await this.call(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      {method: "GET"},
    );
    const user = (basic.user ?? {}) as Record<string, unknown>;
    const profile: TikTokProfile = {
      openId: String(user.open_id ?? ""),
      displayName: typeof user.display_name === "string" ? user.display_name : undefined,
    };
    if (!profile.openId)
      throw new TikTokError("malformed", "TikTok returned an unexpected account.");
    if (scopes.includes("user.info.profile")) {
      try {
        const extra = await this.call("https://open.tiktokapis.com/v2/user/info/?fields=username", {
          method: "GET",
        });
        const name = (extra.user as Record<string, unknown> | undefined)?.username;
        if (typeof name === "string") profile.username = name;
      } catch (error) {
        if (!(error instanceof TikTokError) || error.kind !== "permission") throw error;
      }
    }
    if (scopes.includes("user.info.stats")) {
      try {
        const stats = await this.call(
          "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count",
          {method: "GET"},
        );
        const row = (stats.user ?? {}) as Record<string, unknown>;
        profile.followerCount = count(row.follower_count);
        profile.followingCount = count(row.following_count);
        profile.likesCount = count(row.likes_count);
        profile.videoCount = count(row.video_count);
      } catch (error) {
        if (!(error instanceof TikTokError) || error.kind !== "permission") throw error;
      }
    }
    return profile;
  }
  async videos(scopes: string[]): Promise<TikTokVideo[]> {
    if (!scopes.includes("video.list")) return [];
    try {
      const data = await this.call(
        "https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count,share_count",
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({max_count: TIKTOK_LIMITS.videos}),
        },
      );
      const videos = Array.isArray(data.videos) ? data.videos : [];
      return videos.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const row = value as Record<string, unknown>;
        if (typeof row.id !== "string" || typeof row.create_time !== "number") return [];
        const title = typeof row.title === "string" ? row.title : undefined;
        return [
          {
            id: row.id,
            title,
            createTime: row.create_time,
            url: tiktokUrl(row.share_url),
            viewCount: count(row.view_count),
            likeCount: count(row.like_count),
            commentCount: count(row.comment_count),
            shareCount: count(row.share_count),
          },
        ];
      });
    } catch (error) {
      if (error instanceof TikTokError && error.kind === "permission") return [];
      throw error;
    }
  }
}
