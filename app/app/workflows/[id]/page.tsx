import {DATE_TIME} from "@/lib/ui/dates";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {WorkflowBuilder} from "@/components/workflow-builder";
import {describeStep} from "@/lib/workflows/describe";
import {triggerLabel} from "@/lib/ui/labels";
import {workflowTriggers, type StepInput} from "@/lib/workflows/types";
import {runWorkflow, saveWorkflow, workflowDefinitionAction} from "@/app/workflow-actions";
export default async function WorkflowDetail({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    {id} = await params,
    p = await searchParams,
    [{data: item}, {data: versions}, {data: runs}] = await Promise.all([
      ctx.supabase
        .from("workflow_definitions")
        .select("*")
        .eq("id", id)
        .eq("organisation_id", ctx.organisation.id)
        .maybeSingle(),
      ctx.supabase
        .from("workflow_versions")
        .select("*")
        .eq("workflow_id", id)
        .eq("organisation_id", ctx.organisation.id)
        .order("version", {ascending: false}),
      ctx.supabase
        .from("workflow_runs")
        .select("id,status,trigger_type,started_at,finished_at,created_at")
        .eq("workflow_id", id)
        .eq("organisation_id", ctx.organisation.id)
        .order("created_at", {ascending: false})
        .limit(20),
    ]);
  if (!item) notFound();
  const {data: steps} = await ctx.supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", id)
      .eq("organisation_id", ctx.organisation.id)
      .eq("workflow_version_id", versions?.[0]?.id ?? "")
      .order("step_order"),
    defaults = (steps ?? []).map((x) => ({
      name: x.name,
      type: x.step_type,
      configuration: x.configuration as Record<string, unknown>,
      timeoutSeconds: x.timeout_seconds,
      maxRetries: x.max_retries,
      failurePolicy: x.failure_policy,
      assignedRole: x.assigned_role,
    })) as StepInput[],
    role = ctx.membership.role as OrganisationRole,
    canManage = hasPermission(role, "workflows.manage"),
    canRun = hasPermission(role, "workflow.run"),
    summary = defaults.filter((step) => step.type !== "complete"),
    archived = item.status === "archived";
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/workflows">
        ← Automations
      </Link>
      <Notice searchParams={p} />
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{item.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {archived ? "Archived" : item.enabled ? "On" : "Off"}
              </span>
            </div>
            {item.description ? <p className="mt-1 text-zinc-600">{item.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && !archived && (
              <form action={workflowDefinitionAction}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  className={item.enabled ? "button button-secondary" : "button"}
                  name="action"
                  value={item.enabled ? "disable" : "enable"}
                >
                  {item.enabled ? "Switch off" : "Switch on"}
                </button>
              </form>
            )}
            {canRun && !archived && (
              <form action={runWorkflow}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="executionKey" value={crypto.randomUUID()} />
                <button className="button button-secondary">Run it now</button>
              </form>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {triggerLabel(item.trigger_type)}
          </p>
          <ol className="mt-2 space-y-1.5 text-sm text-zinc-700">
            {summary.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                  {i + 1}
                </span>
                <span>
                  {describeStep(step)}
                  {step.name && step.name !== describeStep(step) ? (
                    <span className="text-zinc-400">{` (“${step.name}”)`}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {!item.enabled && !archived ? (
            <p className="mt-3 text-sm text-zinc-500">
              It&apos;s off, so it won&apos;t run by itself. Switch it on when the steps look right.
            </p>
          ) : null}
        </div>
      </div>
      {canManage && !archived && (
        <form action={saveWorkflow} className="space-y-4">
          <input type="hidden" name="workflowId" value={item.id} />
          <div className="card grid gap-3 md:grid-cols-2">
            <h2 className="font-semibold md:col-span-2">Change this automation</h2>
            <label>
              Name
              <input className="field mt-1 w-full" name="name" defaultValue={item.name} />
            </label>
            <label>
              When should it run?
              <select
                className="field mt-1 w-full"
                name="triggerType"
                defaultValue={item.trigger_type}
              >
                {workflowTriggers.map((x) => (
                  <option key={x} value={x}>
                    {triggerLabel(x)}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              Description
              <textarea
                className="field mt-1 w-full"
                name="description"
                defaultValue={item.description}
              />
            </label>
          </div>
          <WorkflowBuilder defaultSteps={defaults} />
          <div className="card space-y-3">
            <label className="block">
              What did you change? <span className="text-zinc-400">(optional)</span>
              <input
                className="field mt-1 w-full"
                name="reason"
                placeholder="For example: gave the task to a manager instead"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Saved in the change history below, so the team can see what changed and why.
              </span>
            </label>
            <button className="button">Save changes</button>
          </div>
        </form>
      )}
      {canManage && !archived && (
        <form action={workflowDefinitionAction} className="text-sm">
          <input type="hidden" name="id" value={item.id} />
          <button className="text-red-700 hover:underline" name="action" value="archive">
            Archive this automation
          </button>
        </form>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold">Change history</h3>
          {versions?.map((x) => (
            <p className="border-t py-2 text-sm" key={x.id}>
              {x.change_reason} ·{" "}
              <span className="text-zinc-500">
                {new Date(x.created_at).toLocaleString("en-GB", DATE_TIME)}
              </span>
            </p>
          ))}
        </div>
        <div className="card">
          <h3 className="font-semibold">Recent runs</h3>
          {!runs?.length ? (
            <p className="text-sm text-zinc-500">It hasn&apos;t run yet.</p>
          ) : (
            runs.map((x) => (
              <Link
                className="block border-t py-2 text-sm"
                href={`/app/workflow-runs/${x.id}`}
                key={x.id}
              >
                <span className="capitalize">{x.status.replaceAll("_", " ")}</span> ·{" "}
                {triggerLabel(x.trigger_type)} ·{" "}
                <span className="text-zinc-500">
                  {new Date(x.created_at).toLocaleString("en-GB", DATE_TIME)}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
