import Link from "next/link";
import {PageHeader} from "@/components/page-header";
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
        description="Steps Ghost runs for you when something happens, like creating a task or asking someone to approve. They only act inside Ghost and never change your connected tools."
        actions={
          canManage ? (
            <Link className="button" href="/app/workflows/new">
              New automation
            </Link>
          ) : null
        }
      />
      <Notice searchParams={p} />
      <form className="card flex gap-2">
        <input
          className="field flex-1"
          name="q"
          defaultValue={q}
          placeholder="Search automations"
        />
        <select className="field" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {["draft", "active", "disabled", "archived"].map((x) => (
            <option key={x} value={x}>
              {x[0].toUpperCase() + x.slice(1)}
            </option>
          ))}
        </select>
        <button className="button">Filter</button>
      </form>
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
              <div className="flex justify-between">
                <strong>{x.name}</strong>
                <span className="capitalize">{x.status}</span>
              </div>
              <p>{x.description}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {`${triggerLabel(x.trigger_type)} · ${x.enabled ? "On" : "Off"}`}
              </p>
            </Link>
          ))
        )}
      </div>
      {canManage && (
        <div>
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Start from a template</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Ready-made automations you can switch on and adjust.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {workflowTemplates.map((t) => (
              <form action={createFromTemplate} className="card" key={t.key}>
                <input type="hidden" name="templateKey" value={t.key} />
                <strong>{t.name}</strong>
                <p className="text-sm">{t.description}</p>
                <button className="button button-secondary mt-3">Use this template</button>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
