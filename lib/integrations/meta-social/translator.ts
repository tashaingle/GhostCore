import {createHash} from "node:crypto";
import type {NormalisedEventInput} from "@/types/events";
import type {TranslationContext} from "../connector";
import type {SocialMetric, SocialRecord} from "./types";

const clean = (v: unknown, n = 240) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);

export const metaSocialFingerprint = (record: SocialRecord) =>
  createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 24);

export function translateMetaSocial(
  record: SocialMetric,
  ctx: TranslationContext,
  revision: string,
): NormalisedEventInput {
  const platform = record.platform;
  const label =
    record.kind === "media_metric"
      ? `${platform} media`
      : record.kind === "instagram_metric"
        ? "Instagram account"
        : "Facebook Page";

  const eventType =
    record.kind === "media_metric"
      ? "meta_social.media.performance_recorded"
      : record.kind === "instagram_metric"
        ? "meta_social.instagram.performance.daily_recorded"
        : "meta_social.facebook.performance.daily_recorded";

  return {
    organisationId: ctx.organisationId,
    integrationId: ctx.integrationId,
    source: "meta_social",
    category: "marketing",
    eventType,
    title: `${label} · ${clean(record.entityName ?? record.assetName ?? record.entityId)} · ${record.date}`,
    severity: "info",
    occurredAt: `${record.date}T12:00:00.000Z`,
    externalId: `meta_social:${ctx.organisationId}:${ctx.integrationId}:${record.kind}:${record.assetId}:${record.entityId}:${record.date}:${revision}`,
    metadata: {
      platform,
      sourceAssetId: record.assetId,
      sourceEntityType: record.kind,
      sourceEntityId: record.entityId,
      sourceEntityName: clean(record.entityName ?? record.assetName ?? ""),
      reportingDate: record.date,
      mediaType: record.mediaType ?? null,
      metrics: record.metrics,
      privacy: "aggregate_only",
      surface: "organic_social",
    },
    rawPayload: {reportingDate: record.date, revision},
  };
}
