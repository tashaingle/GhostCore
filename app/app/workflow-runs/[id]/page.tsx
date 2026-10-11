import {DATE_TIME} from "@/lib/ui/dates";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {runStatusLabel} from "@/lib/workflows/describe";
import {triggerLabel} from "@/lib/ui/labels";
import {assignmentAction, workflowRunAction} from "@/app/workflow-actions";
export default async function RunDetail({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    people = await organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
    {id} = await params,
    p = await searchParams,
    [{data: run}, {data: steps}, {data: logs}, {data: approvals}, {data: assignments}] =
      await Promise.all([
        ctx.supabase
          .from("workflow_runs")
          .select("*")
          .eq("id", id)
          .eq("organisation_id", ctx.organisation.id)
          .maybeSingle(),
        ctx.supabase
          .from("workflow_run_steps")
          .select("*")
          .eq("run_id", id)
          .eq("organisation_id", ctx.organisation.id)
          .order("step_order")
          .order("attempt"),
        ctx.supabase
          .from("workflow_logs")
          .select("*")
          .eq("run_id", id)
          .eq("organisation_id", ctx.organisation.id)
          .order("created_at")
          .limit(500),
        ctx.supabase
          .from("workflow_approvals")
          .select("*")
          .eq("run_id", id)
          .eq("organisation_id", ctx.organisation.id),
        ctx.supabase
          .from("workflow_assignments")
          .select("*")
          .eq("run_id", id)
          .eq("organisation_id", ctx.organisation.id),
      ]);
  if (!run) notFound();
  const {data: definition} = await ctx.supabase
      .from("workflow_definitions")
      .select("name")
      .eq("id", run.workflow_id)
      .eq("organisation_id", ctx.organisation.id)
      .maybeSingle(),
    {data: stepNames} = await ctx.supabase
      .from("workflow_steps")
      .select("id,name")
      .eq("organisation_id", ctx.organisation.id)
      .in("id", [...new Set((steps ?? []).map((x) => x.step_id))]),
    stepName = (stepId: string) => stepNames?.find((x) => x.id === stepId)?.name,
    role = ctx.membership.role as OrganisationRole,
    canRun = hasPermission(role, "workflow.run"),
    canCancel = hasPermission(role, "workflow.cancel"),
    canRetry = hasPermission(role, "workflow.retry");
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href={`/app/workflows/${run.workflow_id}`}>
        ← {definition?.name ?? "Automation"}
      </Link>
      <Notice searchParams={p} />
      <header className="card">
        <div className="flex justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
              {definition?.name ?? "Automation run"}
            </h1>
            <p className="mt-1 font-medium text-zinc-700">{runStatusLabel(run.status)}</p>
            <p className="text-sm text-zinc-500">{triggerLabel(run.trigger_type)}</p>
          </div>
          <form action={workflowRunAction} className="flex gap-2">
            <input type="hidden" name="id" value={run.id} />
            {canRun && run.status === "running" && (
              <button className="button button-secondary" name="action" value="pause">
                Pause
              </button>
            )}
            {canRun && ["paused", "waiting"].includes(run.status) && (
              <button className="button" name="action" value="resume">
                Resume
              </button>
            )}
            {canRetry && run.status === "failed" && (
              <button className="button" name="action" value="retry">
                Try again
              </button>
            )}
            {canCancel && !["completed", "cancelled"].includes(run.status) && (
              <button className="text-red-700" name="action" value="cancel">
                Stop this run
              </button>
            )}
          </form>
        </div>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Started</dt>
            <dd>
              {run.started_at
                ? new Date(run.started_at).toLocaleString("en-GB", DATE_TIME)
                : "Queued"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Finished</dt>
            <dd>
              {run.finished_at
                ? new Date(run.finished_at).toLocaleString("en-GB", DATE_TIME)
                : "Not yet"}
            </dd>
          </div>
          {run.retry_count ? (
            <div>
              <dt className="text-zinc-500">Tried again</dt>
              <dd>{`${run.retry_count} time${run.retry_count === 1 ? "" : "s"}`}</dd>
            </div>
          ) : null}
        </dl>
        {run.error && <p className="mt-3 text-red-700">{run.error}</p>}
        <div className="mt-3 flex gap-3 text-sm">
          {run.linked_notification_id && (
            <Link className="underline" href={`/app/action-centre/${run.linked_notification_id}`}>
              The alert that started it
            </Link>
          )}
          {run.linked_correlation_id && (
            <Link className="underline" href={`/app/correlations/${run.linked_correlation_id}`}>
              Related events
            </Link>
          )}
          {run.linked_job_id && (
            <Link className="underline" href="/app/jobs">
              Background checks
            </Link>
          )}
        </div>
      </header>
      <div className="card">
        <h3 className="font-semibold">Steps</h3>
        {steps?.map((x) => (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t py-3 text-sm" key={x.id}>
            <strong>{`${x.step_order}. ${stepName(x.step_id) ?? "Step"}`}</strong>
            <span className="text-zinc-600">{runStatusLabel(x.status)}</span>
            {x.attempt > 1 ? <span className="text-zinc-500">{`try ${x.attempt}`}</span> : null}
            {x.error ? <span className="basis-full text-red-700">{x.error}</span> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold">Approvals</h3>
          {approvals?.map((x) => (
            <Link className="block border-t py-2" href={`/app/approvals/${x.id}`} key={x.id}>
              {runStatusLabel(x.status)}
              {x.due_at
                ? ` · answer needed by ${new Date(x.due_at).toLocaleString("en-GB", DATE_TIME)}`
                : ""}
            </Link>
          ))}
        </div>
        <div className="card">
          <h3 className="font-semibold">Tasks and confirmations</h3>
          {assignments?.map((x) => (
            <div className="border-t py-2" key={x.id}>
              <p>
                {x.assigned_role ? `Any ${x.assigned_role}` : people.name(x.assigned_user_id)} ·{" "}
                {runStatusLabel(x.status)}
              </p>
              {x.status === "pending" && canRun && (
                <form action={assignmentAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={x.id} />
                  <input
                    aria-label="Notes"
                    className="field flex-1"
                    name="notes"
                    placeholder="What was done (optional)"
                  />
                  <button className="button">Mark as done</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3 className="font-semibold">What happened</h3>
        {logs?.map((x) => (
          <div className="border-t py-2 text-sm" key={x.id}>
            <time className="text-zinc-500">
              {new Date(x.created_at).toLocaleString("en-GB", DATE_TIME)}
            </time>{" "}
            · {x.message}
          </div>
        ))}
      </div>
    </section>
  );
}
