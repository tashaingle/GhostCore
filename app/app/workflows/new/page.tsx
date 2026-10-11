import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {workflowTriggers} from "@/lib/workflows/types";
import {WorkflowBuilder} from "@/components/workflow-builder";
import {saveWorkflow} from "@/app/workflow-actions";
import {Notice} from "@/components/notice";
import {triggerLabel} from "@/lib/ui/labels";
export default async function NewWorkflow({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams;
  if (!hasPermission(ctx.membership.role as OrganisationRole, "workflows.manage"))
    return <div className="card">Only owners and admins can create automations.</div>;
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/workflows">
        ← Automations
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">New automation</h1>
        <p className="text-zinc-600">
          Pick what starts it, then the steps to follow. It starts switched off, so you can check it
          before it runs.
        </p>
      </div>
      <Notice searchParams={p} />
      <form action={saveWorkflow} className="space-y-4">
        <div className="card grid gap-3 md:grid-cols-2">
          <label>
            Name
            <input className="field mt-1 w-full" name="name" required />
          </label>
          <label>
            When should it run?
            <select className="field mt-1 w-full" name="triggerType">
              {workflowTriggers.map((x) => (
                <option key={x} value={x}>
                  {triggerLabel(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2">
            Description <span className="text-zinc-400">(optional)</span>
            <textarea
              className="field mt-1 w-full"
              name="description"
              placeholder="What it's for, so the team knows"
            />
          </label>
        </div>
        <WorkflowBuilder />
        <input type="hidden" name="reason" value="Created." />
        <button className="button">Create automation</button>
      </form>
    </section>
  );
}
