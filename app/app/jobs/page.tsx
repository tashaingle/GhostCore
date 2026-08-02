import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {jobAction} from "@/app/job-actions";
import {jobMetrics, jobHealth} from "@/lib/jobs/metrics";
import {
  humanJobLabel,
  humanJobState,
  humanScheduleLabel,
  providerLabel,
} from "@/lib/ui/labels";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.toLowerCase() : "";
  const status = typeof params.status === "string" ? params.status : "";

  const [{data: jobs}, {data: runs}, {data: locks}] = await Promise.all([
    ctx.supabase
      .from("background_jobs")
      .select("*")
      .eq("organisation_id", ctx.organisation.id)
      .order("next_run_at"),
    ctx.supabase
      .from("background_job_runs")
      .select("*")
      .eq("organisation_id", ctx.organisation.id)
      .order("created_at", {ascending: false})
      .limit(200),
    ctx.supabase
      .from("background_job_locks")
      .select("job_id")
      .eq("organisation_id", ctx.organisation.id),
  ]);

  const locked = new Set((locks ?? []).map((x) => x.job_id));
  const canRun = hasPermission(ctx.membership.role as OrganisationRole, "integration.sync");
  const canManage = ["owner", "admin"].includes(ctx.membership.role);

  const filtered = (jobs ?? []).filter((j) => {
    const label = humanJobLabel(j.job_key, j.provider).title.toLowerCase();
    const matchesSearch =
      !search ||
      `${j.job_key} ${j.provider ?? ""} ${label}`.toLowerCase().includes(search);
    const matchesStatus = !status || jobHealth(j, locked.has(j.id)) === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Background jobs"
        description="These are automatic chores Ghost runs for you — like syncing tools, matching related events, and housekeeping. You can run any job manually."
      />
      <Notice searchParams={params} />

      <div className="info-banner">
        <strong>What is this page?</strong> Think of it as Ghost’s night shift. If a job is
        “Behind schedule”, either click <strong>Run now</strong> or wait for the daily
        automatic dispatcher (cron).
      </div>

      <form className="card flex flex-wrap gap-3">
        <input
          className="field"
          name="search"
          defaultValue={search}
          placeholder="Search by name or tool"
        />
        <select className="field" name="status" defaultValue={status}>
          <option value="">All states</option>
          {["healthy", "running", "failing", "overdue", "paused"].map((x) => (
            <option key={x} value={x}>
              {humanJobState(x)}
            </option>
          ))}
        </select>
        <button className="button">Filter</button>
      </form>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Scheduled", jobs?.filter((j) => j.enabled && j.next_run_at).length ?? 0],
          ["Running now", locked.size],
          ["Failed runs", runs?.filter((r) => ["failed", "timed_out"].includes(r.status)).length ?? 0],
          ["Retrying", runs?.filter((r) => r.status === "retrying").length ?? 0],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="py-2">What it does</th>
              <th>Tool</th>
              <th>Status</th>
              <th>Last / next run</th>
              <th>Success rate</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => {
              const history = (runs ?? []).filter((r) => r.job_id === job.id);
              const metrics = jobMetrics(history);
              const health = jobHealth(job, locked.has(job.id));
              const label = humanJobLabel(job.job_key, job.provider);
              return (
                <tr className="border-b align-top" key={job.id}>
                  <td className="py-3">
                    <strong>{label.title}</strong>
                    <p className="text-xs text-zinc-500">
                      {humanScheduleLabel(job.schedule_type, job.schedule_value)}
                    </p>
                    {label.detail && label.detail !== job.job_key ? (
                      <p className="text-xs text-zinc-400">{label.detail}</p>
                    ) : null}
                  </td>
                  <td>{providerLabel(job.provider)}</td>
                  <td>
                    <span
                      className={`badge ${
                        health === "healthy"
                          ? "badge-good"
                          : health === "overdue" || health === "failing"
                            ? "badge-critical"
                            : health === "running"
                              ? "badge-info"
                              : "badge-muted"
                      }`}
                    >
                      {humanJobState(health)}
                    </span>
                  </td>
                  <td>
                    {job.last_run_at
                      ? new Date(job.last_run_at).toLocaleString()
                      : "Never run"}
                    <p className="text-xs text-zinc-500">
                      Next:{" "}
                      {job.next_run_at
                        ? new Date(job.next_run_at).toLocaleString()
                        : "Not scheduled"}
                    </p>
                  </td>
                  <td>
                    {metrics.successRate}% · avg {metrics.averageDurationMs} ms
                    <p className="text-xs text-zinc-500">
                      {metrics.failures} failures · {metrics.retries} retries
                    </p>
                  </td>
                  <td>
                    <form action={jobAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={job.id} />
                      {canRun ? (
                        <>
                          <button className="button button-secondary" name="action" value="run">
                            Run now
                          </button>
                          {history[0] &&
                          ["failed", "timed_out"].includes(history[0].status) ? (
                            <button
                              className="button button-secondary"
                              name="action"
                              value="retry"
                            >
                              Retry
                            </button>
                          ) : null}
                          {locked.has(job.id) ? (
                            <button className="text-red-700" name="action" value="cancel">
                              Cancel
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {canManage ? (
                        <button
                          className="button button-secondary"
                          name="action"
                          value={job.enabled ? "pause" : "resume"}
                        >
                          {job.enabled ? "Pause" : "Resume"}
                        </button>
                      ) : null}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card overflow-auto">
        <h3 className="font-semibold">Execution history and logs</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Recent run history — what each automatic task did.
        </p>
        <table className="mt-3 w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th>Status</th>
              <th>Job</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Records</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((run) => {
              const job = jobs?.find((j) => j.id === run.job_id);
              const label = job
                ? humanJobLabel(job.job_key, job.provider).title
                : run.job_id.slice(0, 8);
              return (
                <tr className="border-t" key={run.id}>
                  <td className="py-2 capitalize">{run.status.replaceAll("_", " ")}</td>
                  <td>{label}</td>
                  <td>{new Date(run.created_at).toLocaleString()}</td>
                  <td>{run.duration_ms ?? "—"} ms</td>
                  <td>
                    {run.records_processed} processed · +{run.records_created} created ·{" "}
                    {run.records_skipped} skipped
                  </td>
                  <td className="max-w-xs truncate" title={run.error ?? undefined}>
                    {run.error ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
