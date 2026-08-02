import type {
  NotificationRuleDefinition,
  NotificationCandidate,
  NotificationRuleContext,
  NotificationSeverity,
} from "./types";
import {humanJobLabel} from "@/lib/ui/labels";

const clean = (x: string | null) =>
  String(x ?? "No further detail was recorded.")
    .replace(/bearer\s+\S+|token[=:]\s*\S+/gi, "[credential removed]")
    .slice(0, 500);

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

const latestRuns = async (c: NotificationRuleContext) => {
  const {data: runs} = await c.client
    .from("background_job_runs")
    .select("id,job_id,status,attempt,error,retry_at,completed_at,created_at")
    .eq("organisation_id", c.organisationId)
    .order("created_at", {ascending: false})
    .limit(c.limit * 5);
  const latest = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) if (!latest.has(run.job_id)) latest.set(run.job_id, run);
  return latest;
};

const failed: NotificationRuleDefinition = {
  key: "background_job_failed",
  version: 1,
  name: "Background job failed",
  description: "The latest durable run for a job finished unsuccessfully.",
  category: "background_job",
  defaultSeverity: "warning",
  async evaluate(c) {
    const latest = await latestRuns(c);
    const {data: jobs} = await c.client
      .from("background_jobs")
      .select("id,job_key,provider,consecutive_failures,last_success_at")
      .eq("organisation_id", c.organisationId);
    const threshold = Number(
      c.configuration.criticalFailureThreshold ??
        process.env.NOTIFICATION_CRITICAL_FAILURE_THRESHOLD ??
        3,
    );
    return (jobs ?? []).flatMap((job) => {
      const run = latest.get(job.id);
      if (!run || !["failed", "timed_out"].includes(run.status) || job.job_key === "notification.generate")
        return [];
      const label = humanJobLabel(job.job_key, job.provider);
      const severity: NotificationSeverity =
        job.consecutive_failures >= threshold ? "critical" : "warning";
      return [
        make(c, failed, {
          severity,
          title: `${label.title} failed`,
          summary: clean(run.error) || "The scheduled task stopped with an error.",
          explanation: `${label.detail ?? job.job_key} did not finish successfully.`,
          recommendedAction:
            "Open Background Jobs, review the latest run, then use Retry or Run now.",
          sourceType: "background_job",
          sourceId: job.id,
          condition: "failed",
          evidence: [
            {
              evidenceType: "job_run",
              sourceTable: "background_job_runs",
              sourceId: run.id,
              jobRunId: run.id,
              label: "Latest failed job run",
              description: `Attempt ${run.attempt}; ${clean(run.error)}`,
              observed: {
                status: run.status,
                attempt: run.attempt,
                consecutiveFailures: job.consecutive_failures,
                lastSuccessAt: job.last_success_at,
              },
              expected: {status: "completed"},
              occurredAt: run.completed_at ?? run.created_at,
            },
          ],
        }),
      ];
    });
  },
};

const retrying: NotificationRuleDefinition = {
  key: "background_job_retrying",
  version: 1,
  name: "Background job retrying",
  description: "The latest run for a job is waiting for deterministic retry.",
  category: "background_job",
  defaultSeverity: "warning",
  async evaluate(c) {
    const latest = await latestRuns(c);
    const {data: jobs} = await c.client
      .from("background_jobs")
      .select("id,job_key,provider")
      .eq("organisation_id", c.organisationId);
    return (jobs ?? []).flatMap((job) => {
      const run = latest.get(job.id);
      if (!run || run.status !== "retrying" || job.job_key === "notification.generate") return [];
      const label = humanJobLabel(job.job_key, job.provider);
      return [
        make(c, retrying, {
          severity: run.attempt >= 3 ? "critical" : "warning",
          title: `${label.title} is retrying`,
          summary: `Ghost will try again automatically (attempt ${run.attempt}).`,
          explanation: "The last failure was classified as retryable.",
          recommendedAction: "Wait for the retry, or open Background Jobs and run it now.",
          sourceType: "background_job",
          sourceId: job.id,
          condition: "retrying",
          evidence: [
            {
              evidenceType: "job_retry",
              sourceTable: "background_job_runs",
              sourceId: run.id,
              jobRunId: run.id,
              label: "Latest retry state",
              description: clean(run.error),
              observed: {attempt: run.attempt, retryAt: run.retry_at},
              occurredAt: run.created_at,
            },
          ],
        }),
      ];
    });
  },
};

export const jobStateNotificationRules = [failed, retrying] as const;
