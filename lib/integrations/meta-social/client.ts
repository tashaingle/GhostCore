import "server-only";
import {z} from "zod";
import {
  FB_PAGE_DAY_METRICS,
  IG_USER_DAY_METRICS,
  META_SOCIAL_LIMITS,
  metaSocialEnv,
} from "./config";
import type {SocialAsset, SocialMetric} from "./types";

export type MetaSocialErrorKind =
  | "unauthorized"
  | "permission"
  | "rate_limit"
  | "invalid_parameter"
  | "unavailable"
  | "malformed";

export class MetaSocialError extends Error {
  constructor(
    public kind: MetaSocialErrorKind,
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

const insightValueSchema = z.object({
  value: z.union([z.number(), z.string(), z.record(z.string(), z.unknown())]).optional(),
  end_time: z.string().optional(),
});

const insightSchema = z.object({
  name: z.string(),
  period: z.string().optional(),
  values: z.array(insightValueSchema).default([]),
});

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function dayMetrics(
  rows: z.infer<typeof insightSchema>[],
  date: string,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of rows) {
    const match =
      row.values.find((v) => v.end_time?.startsWith(date)) ??
      row.values[row.values.length - 1];
    if (!match) {
      out[row.name] = null;
      continue;
    }
    if (typeof match.value === "object" && match.value && !Array.isArray(match.value)) {
      // compound metrics: store total if present, else first numeric
      const total = num((match.value as Record<string, unknown>).total);
      if (total != null) out[row.name] = total;
      else {
        const first = Object.values(match.value).map(num).find((n) => n != null);
        out[row.name] = first ?? null;
      }
    } else out[row.name] = num(match.value);
  }
  return out;
}

export class MetaSocialClient {
  private requests = 0;
  constructor(
    private token: string,
    private request: typeof fetch = fetch,
  ) {}

  private async graph<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    asArray = false,
  ): Promise<T | T[]> {
    if (++this.requests > META_SOCIAL_LIMITS.requests) {
      throw new MetaSocialError("rate_limit", "Meta Social request safety limit reached.");
    }
    const env = metaSocialEnv();
    const url = new URL(`https://graph.facebook.com/${env.version}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", this.token);
    let response: Response;
    try {
      response = await this.request(url, {signal: AbortSignal.timeout(15_000)});
    } catch {
      throw new MetaSocialError("unavailable", "Meta Social request timed out.");
    }
    const body = (await response.json()) as {
      data?: unknown;
      error?: {message?: string; code?: number};
      id?: string;
    };
    if (!response.ok || body.error) {
      const code = body.error?.code;
      throw new MetaSocialError(
        code === 190
          ? "unauthorized"
          : code === 200 || code === 10
            ? "permission"
            : code === 4 || code === 17 || code === 80004
              ? "rate_limit"
              : "unavailable",
        code === 190
          ? "Meta access expired or was revoked."
          : code === 200
            ? "Meta permission is missing for organic insights."
            : "Meta Graph API request failed.",
        code,
      );
    }
    if (asArray) {
      const parsed = z.array(schema).safeParse(body.data ?? []);
      if (!parsed.success) throw new MetaSocialError("malformed", "Meta returned an unsupported list shape.");
      return parsed.data;
    }
    const parsed = schema.safeParse(body.data !== undefined ? body : body);
    if (!parsed.success) {
      // some endpoints return object at root
      const root = schema.safeParse(body);
      if (!root.success) throw new MetaSocialError("malformed", "Meta returned an unsupported response shape.");
      return root.data;
    }
    return parsed.data;
  }

  async identity() {
    const env = metaSocialEnv();
    const url = new URL(`https://graph.facebook.com/${env.version}/me`);
    url.search = new URLSearchParams({fields: "id,name", access_token: this.token}).toString();
    const response = await this.request(url, {signal: AbortSignal.timeout(15_000)});
    const parsed = z.object({id: z.string(), name: z.string().default("Meta user")}).safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      throw new MetaSocialError("unauthorized", "Meta identity could not be verified.");
    }
    return parsed.data;
  }

  async permissions() {
    return (await this.graph(
      "me/permissions",
      {limit: "100"},
      z.object({permission: z.string(), status: z.string()}),
      true,
    )) as {permission: string; status: string}[];
  }

  /**
   * Discover Facebook Pages the user manages and linked Instagram professional accounts.
   * Uses page access tokens from me/accounts for subsequent page/IG calls.
   */
  async discoverAssets(): Promise<{assets: SocialAsset[]; pageTokens: Record<string, string>}> {
    const pageSchema = z.object({
      id: z.string(),
      name: z.string().default("Facebook Page"),
      access_token: z.string().optional(),
      fan_count: z.number().optional(),
      followers_count: z.number().optional(),
      instagram_business_account: z.object({id: z.string()}).optional(),
    });
    const pages = (await this.graph(
      "me/accounts",
      {
        fields: "id,name,access_token,fan_count,followers_count,instagram_business_account",
        limit: "100",
      },
      pageSchema,
      true,
    )) as z.infer<typeof pageSchema>[];

    const assets: SocialAsset[] = [];
    const pageTokens: Record<string, string> = {};
    for (const page of pages.slice(0, META_SOCIAL_LIMITS.pages)) {
      if (page.access_token) pageTokens[page.id] = page.access_token;
      assets.push({
        kind: "facebook_page",
        id: page.id,
        name: page.name,
        followers: page.followers_count ?? page.fan_count ?? null,
        accessState: "available",
      });
      if (page.instagram_business_account?.id && page.access_token) {
        try {
          const ig = await this.igProfile(page.instagram_business_account.id, page.access_token);
          assets.push({
            kind: "instagram_account",
            id: ig.id,
            name: ig.name || ig.username || "Instagram",
            pageId: page.id,
            username: ig.username,
            followers: ig.followers_count ?? null,
            accessState: "available",
          });
        } catch {
          assets.push({
            kind: "instagram_account",
            id: page.instagram_business_account.id,
            name: "Instagram (limited access)",
            pageId: page.id,
            accessState: "disabled",
          });
        }
      }
    }
    return {assets, pageTokens};
  }

  private async igProfile(igUserId: string, pageToken: string) {
    const prev = this.token;
    this.token = pageToken;
    try {
      const env = metaSocialEnv();
      const url = new URL(`https://graph.facebook.com/${env.version}/${igUserId}`);
      url.search = new URLSearchParams({
        fields: "id,username,name,followers_count,media_count",
        access_token: pageToken,
      }).toString();
      if (++this.requests > META_SOCIAL_LIMITS.requests) {
        throw new MetaSocialError("rate_limit", "Meta Social request safety limit reached.");
      }
      const response = await this.request(url, {signal: AbortSignal.timeout(15_000)});
      const parsed = z
        .object({
          id: z.string(),
          username: z.string().optional(),
          name: z.string().optional(),
          followers_count: z.number().optional(),
          media_count: z.number().optional(),
        })
        .safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new MetaSocialError("permission", "Instagram account could not be loaded.");
      }
      return parsed.data;
    } finally {
      this.token = prev;
    }
  }

  async pageDayInsights(
    pageId: string,
    pageToken: string,
    since: string,
    until: string,
  ): Promise<SocialMetric[]> {
    const prev = this.token;
    this.token = pageToken;
    try {
      const rows = (await this.graph(
        `${pageId}/insights`,
        {
          metric: FB_PAGE_DAY_METRICS.join(","),
          period: "day",
          since,
          until,
        },
        insightSchema,
        true,
      )) as z.infer<typeof insightSchema>[];

      const dates = new Set<string>();
      for (const row of rows) {
        for (const v of row.values) {
          if (v.end_time) dates.add(v.end_time.slice(0, 10));
        }
      }
      return [...dates].sort().map((date) => ({
        kind: "page_metric" as const,
        platform: "facebook" as const,
        assetId: pageId,
        entityId: pageId,
        date,
        metrics: dayMetrics(rows, date),
      }));
    } catch (error) {
      if (error instanceof MetaSocialError && error.kind === "permission") return [];
      throw error;
    } finally {
      this.token = prev;
    }
  }

  async instagramDayInsights(
    igUserId: string,
    pageToken: string,
    since: string,
    until: string,
    assetName?: string,
  ): Promise<SocialMetric[]> {
    const prev = this.token;
    this.token = pageToken;
    try {
      const rows = (await this.graph(
        `${igUserId}/insights`,
        {
          metric: IG_USER_DAY_METRICS.join(","),
          period: "day",
          since,
          until,
          metric_type: "total_value",
        },
        insightSchema,
        true,
      )) as z.infer<typeof insightSchema>[];

      // Fallback without metric_type for older graph behaviour
      const effective =
        rows.length > 0
          ? rows
          : ((await this.graph(
              `${igUserId}/insights`,
              {metric: IG_USER_DAY_METRICS.join(","), period: "day", since, until},
              insightSchema,
              true,
            )) as z.infer<typeof insightSchema>[]);

      const dates = new Set<string>();
      for (const row of effective) {
        for (const v of row.values) {
          if (v.end_time) dates.add(v.end_time.slice(0, 10));
        }
      }
      // If Meta returns single total values without end_time, emit one day (until)
      if (!dates.size && effective.length) {
        dates.add(until);
      }

      const profile = await this.igProfile(igUserId, pageToken);
      return [...dates].sort().map((date) => ({
        kind: "instagram_metric" as const,
        platform: "instagram" as const,
        assetId: igUserId,
        assetName: assetName ?? profile.username ?? profile.name,
        entityId: igUserId,
        entityName: profile.username ?? profile.name,
        date,
        metrics: {
          ...dayMetrics(effective, date),
          followers: profile.followers_count ?? null,
          mediaCount: profile.media_count ?? null,
        },
      }));
    } catch (error) {
      if (error instanceof MetaSocialError && (error.kind === "permission" || error.kind === "invalid_parameter")) {
        return [];
      }
      throw error;
    } finally {
      this.token = prev;
    }
  }

  async instagramRecentMedia(
    igUserId: string,
    pageToken: string,
  ): Promise<SocialMetric[]> {
    const prev = this.token;
    this.token = pageToken;
    try {
      const mediaSchema = z.object({
        id: z.string(),
        caption: z.string().optional(),
        media_type: z.string().optional(),
        timestamp: z.string().optional(),
        like_count: z.number().optional(),
        comments_count: z.number().optional(),
        permalink: z.string().optional(),
      });
      const media = (await this.graph(
        `${igUserId}/media`,
        {
          fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink",
          limit: String(META_SOCIAL_LIMITS.media),
        },
        mediaSchema,
        true,
      )) as z.infer<typeof mediaSchema>[];

      const out: SocialMetric[] = [];
      for (const item of media.slice(0, META_SOCIAL_LIMITS.media)) {
        let views: number | null = null;
        let reach: number | null = null;
        try {
          const insights = (await this.graph(
            `${item.id}/insights`,
            {metric: "impressions,reach,plays,views"},
            insightSchema,
            true,
          )) as z.infer<typeof insightSchema>[];
          for (const row of insights) {
            const v = num(row.values[0]?.value);
            if (row.name === "impressions" || row.name === "plays" || row.name === "views") {
              if (v != null) views = v;
            }
            if (row.name === "reach" && v != null) reach = v;
          }
        } catch {
          // media insights often restricted; keep engagement-only row
        }
        const date = (item.timestamp ?? new Date().toISOString()).slice(0, 10);
        out.push({
          kind: "media_metric",
          platform: "instagram",
          assetId: igUserId,
          entityId: item.id,
          entityName: (item.caption ?? item.media_type ?? "Media").slice(0, 80),
          date,
          mediaType: item.media_type,
          metrics: {
            likes: item.like_count ?? null,
            comments: item.comments_count ?? null,
            views,
            reach,
          },
        });
      }
      return out;
    } catch (error) {
      if (error instanceof MetaSocialError && error.kind === "permission") return [];
      throw error;
    } finally {
      this.token = prev;
    }
  }
}
