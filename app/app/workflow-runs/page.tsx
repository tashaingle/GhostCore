import {DATE_TIME} from "@/lib/ui/dates";
import Link from "next/link";
import {runStatusLabel} from "@/lib/workflows/describe";
import {triggerLabel} from "@/lib/ui/labels";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {Notice} from "@/components/notice";
export default async function WorkflowRuns({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    status = typeof p.status === "string" ? p.status : "";
  let query = ctx.supabase
    .from("workflow_runs")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .order("created_at", {ascending: false})
    .limit(200);
  if (status) query = query.eq("status", status);
  const [{data: runs}, {data: workflows}] = await Promise.all([
      query,
      ctx.supabase
        .from("workflow_definitions")
        .select("id,name")
        .eq("organisation_id", ctx.organisation.id),
    ]),
    names = new Map((workflows ?? []).map((x) => [x.id, x.name]));
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Automation runs</h1>
        <p className="text-zinc-600">Each time an automation has run, and how far it got.</p>
      </div>
      <Notice searchParams={p} />
      <form className="card flex gap-2">
        <select aria-label="Show" className="field" name="status" defaultValue={status}>
          <option value="">All runs</option>
          {["running", "waiting", "paused", "completed", "failed", "cancelled"].map((x) => (
            <option key={x} value={x}>
              {runStatusLabel(x)}
            </option>
          ))}
        </select>
        <button className="button">Filter</button>
      </form>
      <div className="overflow-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Automation</th>
              <th>How it went</th>
              <th>What started it</th>
              <th className="pr-3">When</th>
            </tr>
          </thead>
          <tbody>
            {runs?.map((x) => (
              <tr className="border-t" key={x.id}>
                <td className="p-3">
                  <Link className="font-semibold" href={`/app/workflow-runs/${x.id}`}>
                    {names.get(x.workflow_id) ?? "Automation"}
                  </Link>
                </td>
                <td>{runStatusLabel(x.status)}</td>
                <td>{triggerLabel(x.trigger_type)}</td>
                <td className="pr-3">
                  {new Date(x.created_at).toLocaleString("en-GB", DATE_TIME)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
