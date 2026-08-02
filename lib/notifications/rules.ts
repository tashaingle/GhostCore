import {jobStateNotificationRules} from "./job-state-rules";
import {extraNotificationRules} from "./extra-rules";
import type {
  NotificationCandidate,
  NotificationRuleContext,
  NotificationRuleDefinition,
} from "./types";
import {humanJobLabel, providerLabel} from "@/lib/ui/labels";

const candidate = (
  context: NotificationRuleContext,
  rule: NotificationRuleDefinition,
  input: Omit<
    NotificationCandidate,
    "organisationId" | "ruleKey" | "ruleVersion" | "category" | "fingerprintParts"
  > & {fingerprintParts?: string[]},
): NotificationCandidate => ({
  organisationId: context.organisationId,
  ruleKey: rule.key,
  ruleVersion: rule.version,
  category: rule.category,
  fingerprintParts: [
    context.organisationId,
    rule.key,
    String(rule.version),
    input.sourceType,
    input.sourceId,
    input.condition,
    ...(input.fingerprintParts ?? []),
  ],
  ...input,
});

const safe = (value: string | null | undefined) =>
  String(value ?? "No further detail was recorded.")
    .replace(/bearer\s+\S+|token[=:]\s*\S+/gi, "[credential removed]")
    .slice(0, 500);

const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return "unknown time";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

const jobStale: NotificationRuleDefinition = {
  key: "background_job_stale",
  version: 1,
  name: "Scheduled job stale",
  description: "A due job is beyond the explicit lateness threshold.",
  category: "background_job",
  defaultSeverity: "warning",
  async evaluate(c) {
    const multiplier = Number(
      c.configuration.staleMultiplier ??
        process.env.NOTIFICATION_STALE_INTERVAL_MULTIPLIER ??
        2,
    );
    const cutoff = new Date(c.now.getTime() - 15 * 60000).toISOString();
    const {data} = await c.client
      .from("background_jobs")
      .select("id,job_key,provider,next_run_at,last_success_at,schedule_value")
      .eq("organisation_id", c.organisationId)
      .eq("enabled", true)
      .lt("next_run_at", cutoff)
      .order("next_run_at")
      .limit(c.limit);
    return (data ?? [])
      .filter((x) => x.job_key !== "notification.generate")
      .map((job) => {
        const label = humanJobLabel(job.job_key, job.provider);
        return candidate(c, jobStale, {
          severity:
            job.next_run_at &&
            c.now.getTime() - Date.parse(job.next_run_at) > multiplier * 3600000
              ? "critical"
              : "warning",
          title: `${label.title} is behind schedule`,
          summary: `This automatic task was due ${formatWhen(job.next_run_at)} and has not run yet.`,
          explanation:
            "Ghost’s background scheduler has not run this job recently. This is usually fixed by enabling the daily job cron.",
          recommendedAction:
            "Open Background Jobs and click Run now, or wait for the scheduled dispatcher. You can dismiss this if you only sync tools manually.",
          sourceType: "background_job",
          sourceId: job.id,
          condition: "stale",
          evidence: [
            {
              evidenceType: "job_schedule",
              sourceTable: "background_jobs",
              sourceId: job.id,
              label: "Overdue schedule",
              description: "The next-run time is in the past.",
              observed: {
                nextRunAt: job.next_run_at,
                lastSuccessAt: job.last_success_at,
                schedule: job.schedule_value,
              },
              expected: {latestAllowed: cutoff},
              occurredAt: job.next_run_at!,
            },
          ],
        });
      });
  },
};

const integrationError: NotificationRuleDefinition = {
  key: "integration_error",
  version: 1,
  name: "Integration error",
  description: "A stored integration is disconnected, expired or in error.",
  category: "integration",
  defaultSeverity: "warning",
  async evaluate(c) {
    const {data} = await c.client
      .from("integrations")
      .select("id,provider,status,last_sync_status,last_sync_error,updated_at")
      .eq("organisation_id", c.organisationId)
      .in("status", ["error", "disconnected", "expired"])
      .limit(c.limit);
    return (data ?? []).map((x) =>
      candidate(c, integrationError, {
        severity: x.status === "expired" || x.status === "error" ? "critical" : "warning",
        title: `${providerLabel(x.provider)} needs attention`,
        summary:
          safe(x.last_sync_error) ||
          `Connection status is “${x.status.replaceAll("_", " ")}”.`,
        explanation: `Ghost cannot use this connected tool until it is fixed (status: ${x.status}).`,
        recommendedAction:
          x.status === "disconnected" || x.status === "expired"
            ? "Open Integrations and reconnect this tool."
            : "Open Integrations, review the error, then try Sync now.",
        sourceType: "integration",
        sourceId: x.id,
        condition: x.status,
        evidence: [
          {
            evidenceType: "integration_state",
            sourceTable: "integrations",
            sourceId: x.id,
            label: "Integration status",
            description: safe(x.last_sync_error),
            observed: {
              provider: x.provider,
              status: x.status,
              lastSyncStatus: x.last_sync_status,
            },
            expected: {status: "connected"},
            occurredAt: x.updated_at,
          },
        ],
      }),
    );
  },
};

const integrationCredentials: NotificationRuleDefinition = {
  key: "integration_credentials_expiring",
  version: 1,
  name: "Provider credential expiring",
  description:
    "A connection may lose access soon when no refresh token can renew it.",
  category: "credential",
  defaultSeverity: "warning",
  async evaluate(c) {
    const until = new Date(c.now.getTime() + 7 * 86400000).toISOString();
    const {data} = await c.client
      .from("integrations")
      .select("id,provider,token_expires_at,refresh_token_encrypted,status")
      .eq("organisation_id", c.organisationId)
      .eq("status", "connected")
      .not("token_expires_at", "is", null)
      .lte("token_expires_at", until)
      .limit(c.limit);
    // Short-lived access tokens with a refresh token renew automatically - skip those.
    return (data ?? [])
      .filter((x) => !x.refresh_token_encrypted)
      .map((x) =>
        candidate(c, integrationCredentials, {
          severity:
            Date.parse(x.token_expires_at!) - c.now.getTime() < 86400000
              ? "critical"
              : "warning",
          title: `${providerLabel(x.provider)} access is expiring`,
          summary: `Access may stop working after ${formatWhen(x.token_expires_at)}.`,
          explanation:
            "This connection does not have a long-lived refresh token, so Ghost cannot renew it automatically.",
          recommendedAction: "Open Integrations and reconnect this tool before it expires.",
          sourceType: "integration",
          sourceId: x.id,
          condition: "credential_expiry",
          evidence: [
            {
              evidenceType: "credential_expiry",
              sourceTable: "integrations",
              sourceId: x.id,
              label: "Known access expiry",
              description: "No secret values are stored in this evidence.",
              observed: {expiresAt: x.token_expires_at},
              expected: {after: until},
              occurredAt: x.token_expires_at!,
            },
          ],
        }),
      );
  },
};

const rateLimited: NotificationRuleDefinition = {
  key: "integration_rate_limited",
  version: 1,
  name: "Provider rate limited",
  description: "An integration log explicitly records provider rate limiting.",
  category: "integration",
  defaultSeverity: "warning",
  async evaluate(c) {
    const {data} = await c.client
      .from("integration_logs")
      .select("id,integration_id,provider,started_at,error_message")
      .eq("organisation_id", c.organisationId)
      .eq("rate_limited", true)
      .order("started_at", {ascending: false})
      .limit(c.limit);
    return (data ?? []).map((x) =>
      candidate(c, rateLimited, {
        severity: "warning",
        title: `${providerLabel(x.provider)} asked Ghost to slow down`,
        summary:
          safe(x.error_message) ||
          "The provider temporarily limited how fast Ghost can import data.",
        explanation: "This is normal when too many requests were made in a short period.",
        recommendedAction: "Wait a little, then try Sync again from Integrations.",
        sourceType: "integration",
        sourceId: x.integration_id,
        condition: "rate_limited",
        evidence: [
          {
            evidenceType: "integration_log",
            sourceTable: "integration_logs",
            sourceId: x.id,
            label: "Rate limit record",
            description: safe(x.error_message),
            observed: {rateLimited: true, provider: x.provider},
            expected: {rateLimited: false},
            occurredAt: x.started_at,
          },
        ],
      }),
    );
  },
};

const correlationReview: NotificationRuleDefinition = {
  key: "high_confidence_correlation_requires_review",
  version: 1,
  name: "High-confidence correlation requires review",
  description: "An active deterministic correlation exceeds the configured score.",
  category: "correlation",
  defaultSeverity: "warning",
  async evaluate(c) {
    const score = Number(c.configuration.minimumCorrelationScore ?? 80);
    const {data} = await c.client
      .from("event_correlations")
      .select(
        "id,rule_key,rule_version,score,strength,source_provider,target_provider,occurred_at",
      )
      .eq("organisation_id", c.organisationId)
      .eq("active", true)
      .gte("score", score)
      .order("score", {ascending: false})
      .limit(c.limit);
    return (data ?? []).map((x) =>
      candidate(c, correlationReview, {
        severity: x.score >= 95 ? "critical" : "warning",
        title: `Review possible link: ${providerLabel(x.source_provider)} ↔ ${providerLabel(x.target_provider)}`,
        summary: `Ghost found a ${x.strength} match (score ${x.score}/100). This is not proof of cause.`,
        explanation: "A correlation means two things look related in the data - not that one caused the other.",
        recommendedAction: "Open the correlation, check the evidence, then resolve or dismiss this item.",
        sourceType: "correlation",
        sourceId: x.id,
        condition: "requires_review",
        evidence: [
          {
            evidenceType: "correlation",
            sourceTable: "event_correlations",
            sourceId: x.id,
            correlationId: x.id,
            label: "Correlation evidence",
            description: `${x.rule_key} v${x.rule_version}; ${x.strength}.`,
            observed: {score: x.score, strength: x.strength},
            expected: {minimumScore: score},
            occurredAt: x.occurred_at,
          },
        ],
      }),
    );
  },
};

const importRejected: NotificationRuleDefinition = {
  key: "manual_import_rejected_rows",
  version: 1,
  name: "Manual import rejected rows",
  description: "A CSV import persisted rejected rows.",
  category: "import",
  defaultSeverity: "warning",
  async evaluate(c) {
    const {data} = await c.client
      .from("manual_imports")
      .select("id,filename,row_count,successful,failed,duplicates,created_at")
      .eq("organisation_id", c.organisationId)
      .gt("failed", 0)
      .order("created_at", {ascending: false})
      .limit(c.limit);
    return (data ?? []).map((x) =>
      candidate(c, importRejected, {
        severity: x.successful === 0 ? "critical" : "warning",
        title: `Import “${x.filename}” had rejected rows`,
        summary: `${x.failed} of ${x.row_count} rows could not be imported.`,
        explanation: "Some CSV rows failed validation and were skipped.",
        recommendedAction: "Fix the rejected rows in your file and import again.",
        sourceType: "manual_import",
        sourceId: x.id,
        condition: "rejected_rows",
        evidence: [
          {
            evidenceType: "import_result",
            sourceTable: "manual_imports",
            sourceId: x.id,
            label: "CSV import totals",
            description: "Only counts are stored - not the row contents.",
            observed: {
              rows: x.row_count,
              accepted: x.successful,
              rejected: x.failed,
              duplicates: x.duplicates,
            },
            expected: {rejected: 0},
            occurredAt: x.created_at,
          },
        ],
      }),
    );
  },
};

const setup: NotificationRuleDefinition = {
  key: "organisation_setup_incomplete",
  version: 1,
  name: "Organisation setup incomplete",
  description: "Existing required organisation identity fields remain empty.",
  category: "organisation",
  defaultSeverity: "info",
  async evaluate(c) {
    const {data} = await c.client
      .from("organisations")
      .select("id,name,slug,timezone,default_currency")
      .eq("id", c.organisationId)
      .maybeSingle();
    if (!data) return [];
    const missing = ["name", "slug", "timezone", "default_currency"].filter(
      (k) => !String(data[k as keyof typeof data] ?? "").trim(),
    );
    return missing.length
      ? [
          candidate(c, setup, {
            severity: "info",
            title: "Finish organisation setup",
            summary: `Still needed: ${missing.join(", ")}.`,
            explanation: "A few required organisation settings are empty.",
            recommendedAction: "Open Settings and complete the missing fields.",
            sourceType: "organisation",
            sourceId: data.id,
            condition: "required_fields_missing",
            evidence: [
              {
                evidenceType: "organisation_configuration",
                sourceTable: "organisations",
                sourceId: data.id,
                label: "Missing required fields",
                description: missing.join(", "),
                observed: {missing},
                expected: {missing: []},
                occurredAt: c.now.toISOString(),
              },
            ],
          }),
        ]
      : [];
  },
};

export const notificationRuleRegistry = [
  ...jobStateNotificationRules,
  jobStale,
  ...extraNotificationRules,
  integrationError,
  integrationCredentials,
  rateLimited,
  correlationReview,
  importRejected,
  setup,
] as const;

export const getNotificationRule = (key: string) =>
  notificationRuleRegistry.find((x) => x.key === key);
