import "server-only";
import {createServiceClient} from "@/lib/supabase/service";
import {runPool} from "./pool";
import {ensureRegisteredJobs} from "./registry";
import {executeJob} from "./runner";

/** Stop starting jobs after this long; the dispatch route's maxDuration is 300 seconds. */
export const DISPATCH_BUDGET_MS = 240_000;
/** Don't start a job with less time than this left in the budget. */
export const MIN_JOB_WINDOW_MS = 15_000;
export const MAX_JOBS_PER_DISPATCH = 100;
export const DEFAULT_CONCURRENCY = 4;

export const clampConcurrency = (value: unknown) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(8, n) : DEFAULT_CONCURRENCY;
};

export async function dispatchDueJobs(
  options: {
    organisationId?: string;
    workerId?: string;
    concurrency?: number;
    budgetMs?: number;
  } = {},
) {
  const startedAt = Date.now(),
    deadline = startedAt + (options.budgetMs ?? DISPATCH_BUDGET_MS),
    client = createServiceClient(),
    concurrency = clampConcurrency(options.concurrency),
    workerId = options.workerId ?? `worker-${crypto.randomUUID()}`;
  let orgQuery = client.from("organisations").select("id,created_by").limit(1000);
  if (options.organisationId) orgQuery = orgQuery.eq("id", options.organisationId);
  const {data: organisations, error: orgError} = await orgQuery;
  if (orgError) throw orgError;
  for (const org of organisations ?? []) await ensureRegisteredJobs(client, org.id, org.created_by);
  let query = client
    .from("background_jobs")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(MAX_JOBS_PER_DISPATCH);
  if (options.organisationId) query = query.eq("organisation_id", options.organisationId);
  const {data: jobs, error} = await query;
  if (error) throw error;
  // Most jobs wait on network I/O, so a few run side by side. Per-job locks prevent a job
  // overlapping itself. Jobs not started before the deadline stay due for the next dispatch.
  const {results, notRun} = await runPool(jobs ?? [], concurrency, async (job) => {
    const remaining = deadline - Date.now();
    if (remaining < MIN_JOB_WINDOW_MS) return null;
    try {
      return {
        jobId: job.id,
        jobKey: job.job_key,
        ...(await executeJob(client, job, workerId, remaining)),
      };
    } catch (jobError) {
      console.error("Background job could not be executed", job.job_key, jobError);
      return {jobId: job.id, jobKey: job.job_key, status: "error" as const};
    }
  });
  return {
    workerId,
    discovered: jobs?.length ?? 0,
    deferred: notRun,
    concurrency,
    durationMs: Date.now() - startedAt,
    results,
  };
}
