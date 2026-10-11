import Link from "next/link";
import {Search} from "lucide-react";
import {PageHeader} from "@/components/page-header";
import {describeStep} from "@/lib/workflows/describe";
import {triggerLabel} from "@/lib/ui/labels";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {workflowTemplates} from "@/lib/workflows/templates";
import {createFromTemplate} from "@/app/workflow-actions";
export default async function Workflows({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    q = typeof p.q === "string" ? p.q.slice(0, 100) : "",
    status = typeof p.status === "string" ? p.status : "";
  let query = ctx.supabase
    .from("workflow_definitions")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .order("updated_at", {ascending: false})
    .limit(200);
  if (status) query = query.eq("status", status);
  if (q) {
    const safe = q.replace(/[%(),]/g, "");
    query = query.or(
      `name.ilike.%${safe}%,description.ilike.%${safe}%,trigger_type.ilike.%${safe}%`,
    );
  }
  const {data: rows} = await query,
    canManage = hasPermission(ctx.membership.role as OrganisationRole, "workflows.manage");
  return (
    <section className="space-y-6">
      <PageHeader
        title="Automations"
        description="Steps Metric Mage runs for you when something happens, like creating a task or asking someone to approve. They only act inside Metric Mage and never change your connected tools."
        actions={
          canManage ? (
            <Link className="button" href="/app/workflows/new">
              New automation
            </Link>
          ) : null
        }
      />
      <Notice searchParams={p} />
      {rows?.length || q || status ? (
        <form className="card flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-zinc-700">
            Search your automations
            <span className="relative mt-1 block">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                className="field w-full pl-9"
                name="q"
                defaultValue={q}
                placeholder="Name or description"
              />
            </span>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Show
            <select
              className="field mt-1 block w-full sm:w-auto"
              name="status"
              defaultValue={status}
            >
              <option value="">All automations</option>
              <option value="active">On</option>
              <option value="disabled">Off</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="button">Search</button>
        </form>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {!rows?.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-10 text-center text-sm text-zinc-500 lg:col-span-2">
            {q || status
              ? "No automations match your search."
              : canManage
                ? "No automations yet. Start from a template below, or create your own."
                : "No automations yet."}
          </div>
        ) : (
          rows.map((x) => (
            <Link className="card block" href={`/app/workflows/${x.id}`} key={x.id}>
              <div className="flex items-start justify-between gap-3">
                <strong>{x.name}</strong>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    x.enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {x.status === "archived" ? "Archived" : x.enabled ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{x.description}</p>
              <p className="mt-2 text-xs text-zinc-500">{triggerLabel(x.trigger_type)}</p>
            </Link>
          ))
        )}
      </div>
      {canManage && (
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Start from a template</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Ready-made automations. Using one adds a copy to your list above, where you can change
            any step before switching it on.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {workflowTemplates.map((t) => (
              <form action={createFromTemplate} className="card" key={t.key}>
                <input type="hidden" name="templateKey" value={t.key} />
                <strong>{t.name}</strong>
                <p className="mt-1 text-sm text-zinc-600">{t.description}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {triggerLabel(t.definition.triggerType)}
                </p>
                <ol className="mt-1.5 space-y-1 text-sm text-zinc-700">
                  {t.definition.steps
                    .filter((step) => step.type !== "complete")
                    .map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                          {i + 1}
                        </span>
                        {describeStep(step)}
                      </li>
                    ))}
                </ol>
                <button className="button button-secondary mt-4">Use this template</button>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
