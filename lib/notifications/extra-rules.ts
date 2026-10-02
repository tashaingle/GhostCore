import {getProvider} from "@/lib/integrations/registry";
import {timeAgo} from "@/lib/home/connections";
import {providerLabel} from "@/lib/ui/labels";
import type {
  NotificationCandidate,
  NotificationRuleContext,
  NotificationRuleDefinition,
} from "./types";
const make = (
  c: NotificationRuleContext,
  r: NotificationRuleDefinition,
  x: Omit<
    NotificationCandidate,
    "organisationId" | "ruleKey" | "ruleVersion" | "category" | "fingerprintParts"
  >,
): NotificationCandidate => ({
  organisationId: c.organisationId,
  ruleKey: r.key,
  ruleVersion: r.version,
  category: r.category,
  fingerprintParts: [
    c.organisationId,
    r.key,
    String(r.version),
    x.sourceType,
    x.sourceId,
    x.condition,
  ],
  ...x,
});
const safe = (x: string | null) =>
  String(x ?? "No safe detail recorded.")
    .replace(/bearer\s+\S+|token[=:]\s*\S+/gi, "[credential removed]")
    .slice(0, 500);
const lockContention: NotificationRuleDefinition = {
  key: "background_job_lock_contention",
  version: 1,
  name: "Background task skipped",
  description: "A background task keeps being skipped.",
  category: "background_job",
  defaultSeverity: "info",
  async evaluate(c) {
    const since = new Date(c.now.getTime() - 3600000).toISOString(),
      {data: runs} = await c.client
        .from("background_job_runs")
        .select("id,job_id,error,created_at")
        .eq("organisation_id", c.organisationId)
        .eq("status", "skipped")
        .gte("created_at", since)
        .order("created_at", {ascending: false})
        .limit(c.limit),
      groups = new Map<string, NonNullable<typeof runs>>();
    for (const run of runs ?? []) {
      if (/lock/i.test(run.error ?? ""))
        groups.set(run.job_id, [...(groups.get(run.job_id) ?? []), run]);
    }
    return [...groups]
      .filter(([, items]) => items.length >= 3)
      .map(([jobId, items]) =>
        make(c, lockContention, {
          severity: items.length >= 6 ? "warning" : "info",
          title: "A background task keeps getting skipped",
          summary: `It was skipped ${items.length} times in an hour because another run was still going.`,
          explanation:
            "Ghost skips a task if the previous run hasn't finished. One skip is normal; this has happened at least three times.",
          recommendedAction:
            "Usually this sorts itself out. If it keeps happening, open Background jobs to see which task is slow.",
          sourceType: "background_job",
          sourceId: jobId,
          condition: "lock_contention",
          evidence: items.map((x) => ({
            evidenceType: "lock_skip",
            sourceTable: "background_job_runs",
            sourceId: x.id,
            jobRunId: x.id,
            label: "Lock-protected skip",
            description: safe(x.error),
            observed: {status: "skipped"},
            expected: {maximumPerHour: 2},
            occurredAt: x.created_at,
          })),
        }),
      );
  },
};
const integrationStale: NotificationRuleDefinition = {
  key: "integration_stale",
  version: 1,
  name: "Tool not syncing",
  description: "A connected tool hasn't synced for longer than expected.",
  category: "integration",
  defaultSeverity: "warning",
  async evaluate(c) {
    const {data} = await c.client
      .from("integrations")
      .select("id,provider,status,last_sync_at,updated_at")
      .eq("organisation_id", c.organisationId)
      .eq("status", "connected")
      .limit(c.limit);
    return (data ?? []).flatMap((x) => {
      const schedule = getProvider(x.provider)?.schedule,
        interval =
          schedule === "hourly"
            ? 3600000
            : schedule === "daily" || schedule === "webhook"
              ? 86400000
              : null;
      if (!interval) return [];
      const last = x.last_sync_at ?? x.updated_at,
        late = c.now.getTime() - Date.parse(last);
      if (late < interval * 2) return [];
      return [
        make(c, integrationStale, {
          severity: late >= interval * 3 ? "critical" : "warning",
          title: `${providerLabel(x.provider)} hasn't synced recently`,
          summary: `No new data coming in. Last synced ${timeAgo(last, c.now)}.`,
          explanation: `${providerLabel(x.provider)} normally updates ${schedule === "hourly" ? "every hour" : "every day"}, but Ghost hasn't received new data for more than twice that long.`,
          recommendedAction:
            "Open Connections and click Sync now. If it fails, reconnect the tool.",
          sourceType: "integration",
          sourceId: x.id,
          condition: "stale",
          evidence: [
            {
              evidenceType: "integration_freshness",
              sourceTable: "integrations",
              sourceId: x.id,
              label: "Last successful sync",
              description: `Expected ${schedule} cadence.`,
              observed: {lastSyncAt: last, elapsedMs: late},
              expected: {maximumElapsedMs: interval * 2},
              occurredAt: last,
            },
          ],
        }),
      ];
    });
  },
};
const correlationInvalidated: NotificationRuleDefinition = {
  key: "correlation_invalidated",
  version: 1,
  name: "Link withdrawn",
  description: "A link between events was withdrawn.",
  category: "correlation",
  defaultSeverity: "info",
  async evaluate(c) {
    const {data} = await c.client
      .from("event_correlations")
      .select("id,rule_key,rule_version,invalidation_reason,invalidated_at,updated_at")
      .eq("organisation_id", c.organisationId)
      .eq("active", false)
      .not("invalidated_at", "is", null)
      .order("invalidated_at", {ascending: false})
      .limit(c.limit);
    return (data ?? []).map((x) =>
      make(c, correlationInvalidated, {
        severity: "info",
        title: "A link between events was withdrawn",
        summary: safe(x.invalidation_reason),
        explanation:
          "The correlation explicitly stores active=false and an invalidation timestamp.",
        recommendedAction: "Review the revision and actions previously based on it.",
        sourceType: "correlation",
        sourceId: x.id,
        condition: "invalidated",
        evidence: [
          {
            evidenceType: "correlation_state",
            sourceTable: "event_correlations",
            sourceId: x.id,
            correlationId: x.id,
            label: "Withdrawn link",
            description: safe(x.invalidation_reason),
            observed: {active: false, ruleKey: x.rule_key, ruleVersion: x.rule_version},
            expected: {active: true},
            occurredAt: x.invalidated_at ?? x.updated_at,
          },
        ],
      }),
    );
  },
};
const importFailed: NotificationRuleDefinition = {
  key: "manual_import_failed",
  version: 1,
  name: "Manual import failed",
  description: "A CSV import accepted no rows and rejected rows.",
  category: "import",
  defaultSeverity: "critical",
  async evaluate(c) {
    const {data} = await c.client
      .from("manual_imports")
      .select("id,filename,row_count,successful,failed,created_at")
      .eq("organisation_id", c.organisationId)
      .eq("successful", 0)
      .gt("failed", 0)
      .order("created_at", {ascending: false})
      .limit(c.limit);
    return (data ?? []).map((x) =>
      make(c, importFailed, {
        severity: x.failed === x.row_count ? "critical" : "warning",
        title: `${x.filename} import failed`,
        summary: `No rows were accepted; ${x.failed} were rejected.`,
        explanation: "None of the rows in this file could be imported.",
        recommendedAction: "Inspect validation errors, correct the file, and retry.",
        sourceType: "manual_import",
        sourceId: x.id,
        condition: "failed",
        evidence: [
          {
            evidenceType: "import_result",
            sourceTable: "manual_imports",
            sourceId: x.id,
            label: "Failed CSV import totals",
            description: "Aggregate counts only.",
            observed: {rows: x.row_count, accepted: x.successful, rejected: x.failed},
            expected: {acceptedMinimum: 1},
            occurredAt: x.created_at,
          },
        ],
      }),
    );
  },
};
export const extraNotificationRules = [
  lockContention,
  integrationStale,
  correlationInvalidated,
  importFailed,
] as const;
