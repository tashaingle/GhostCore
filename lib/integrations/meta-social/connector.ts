import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {MetaSocialClient, MetaSocialError} from "./client";
import {META_SOCIAL_LIMITS} from "./config";
import {metaSocialFingerprint, translateMetaSocial} from "./translator";
import type {MetaSocialSettings, SocialMetric, SocialRecord} from "./types";

const day = (date: Date) => date.toISOString().slice(0, 10);

export class MetaSocialConnector implements IntegrationConnector {
  readonly provider = "meta_social";
  private error?: unknown;
  constructor(
    private client: MetaSocialClient,
    private settings: MetaSocialSettings,
    private pageTokens: Record<string, string> = {},
    private now: () => Date = () => new Date(),
  ) {}

  connect = async () => ({ok: true});
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;

  async healthCheck() {
    try {
      await this.client.identity();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof MetaSocialError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }

  translate(record: RawProviderRecord, ctx: TranslationContext) {
    const typed = record as unknown as SocialRecord;
    return translateMetaSocial(typed, ctx, metaSocialFingerprint(typed));
  }

  async sync(ctx: IntegrationSyncContext) {
    const selected = (this.settings.assets ?? [])
      .filter((a) => a.selected && a.accessState !== "disabled")
      .slice(0, META_SOCIAL_LIMITS.pages);
    if (!selected.length) {
      throw new MetaSocialError(
        "permission",
        "Select at least one Facebook Page or Instagram account.",
      );
    }

    // Page tokens are short-lived; always re-discover from the user token in-memory only.
    // Never persist page tokens into integrations.settings.
    const discovered = await this.client.discoverAssets();
    const pageTokens = {...discovered.pageTokens, ...this.pageTokens};

    const initial = !this.settings.initialSyncComplete;
    const end = new Date(this.now());
    const start = new Date(end);
    start.setUTCDate(
      start.getUTCDate() - (initial ? META_SOCIAL_LIMITS.initialDays : META_SOCIAL_LIMITS.reconcileDays),
    );
    const since = day(start);
    const until = day(end);

    const records: SocialMetric[] = [];
    const failed: string[] = [];

    for (const asset of selected) {
      try {
        if (asset.kind === "facebook_page") {
          const token = pageTokens[asset.id];
          if (!token) {
            failed.push(asset.id);
            continue;
          }
          const metrics = await this.client.pageDayInsights(asset.id, token, since, until);
          records.push(
            ...metrics.map((m) => ({
              ...m,
              assetName: asset.name,
              entityName: asset.name,
              metrics: {...m.metrics, followers: asset.followers ?? m.metrics.followers ?? null},
            })),
          );
        } else {
          const pageId = asset.pageId;
          const token = pageId ? pageTokens[pageId] : undefined;
          if (!token) {
            failed.push(asset.id);
            continue;
          }
          const [accountMetrics, mediaMetrics] = await Promise.all([
            this.client.instagramDayInsights(asset.id, token, since, until, asset.name),
            this.client.instagramRecentMedia(asset.id, token),
          ]);
          records.push(...accountMetrics, ...mediaMetrics);
        }
      } catch {
        failed.push(asset.id);
      }
    }

    const fingerprints = {...(this.settings.fingerprints ?? {})};
    const events = [];
    for (const record of records) {
      const fp = metaSocialFingerprint(record);
      const key = `${record.kind}:${record.assetId}:${record.entityId}:${record.date}`;
      if (fingerprints[key] === fp) continue;
      events.push(
        translateMetaSocial(
          record,
          {...ctx, receivedAt: ctx.receivedAt ?? this.now().toISOString()},
          fp,
        ),
      );
      fingerprints[key] = fp;
    }

    return {
      received: records.length,
      events,
      filtered: records.length - events.length,
      rateLimited: false,
      settings: {
        ...this.settings,
        initialSyncComplete: failed.length === 0,
        lastSyncAt: this.now().toISOString(),
        lastSyncMode: initial ? "meta_social_initial" : "meta_social_reconcile",
        fingerprints: Object.fromEntries(Object.entries(fingerprints).slice(-8_000)),
        assetsSucceeded: selected.length - failed.length,
        assetsFailed: failed.length,
        failedAssetIds: failed,
      },
      pages: selected.length,
    };
  }
}
