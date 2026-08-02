import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {titleCase} from "@/lib/ui/labels";

const statuses = ["pending", "approved", "rejected", "expired", "cancelled"] as const;

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const p = await searchParams;
  const status = typeof p.status === "string" ? p.status : "pending";
  const mine = p.mine === "1";

  let query = ctx.supabase
    .from("workflow_approvals")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .order("created_at", {ascending: false})
    .limit(200);
  if (status) query = query.eq("status", status);
  if (mine) query = query.eq("approver_user_id", ctx.user.id);

  const {data: rows} = await query;
  const now = new Date();

  return (
    <section className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Decisions people need to make for workflows (approve or reject)."
      />
      <Notice searchParams={p} />

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Pending", rows?.filter((x) => x.status === "pending").length ?? 0],
          ["Approved", rows?.filter((x) => x.status === "approved").length ?? 0],
          ["Rejected", rows?.filter((x) => x.status === "rejected").length ?? 0],
          [
            "Overdue",
            rows?.filter(
              (x) => x.status === "pending" && x.due_at && new Date(x.due_at) < now,
            ).length ?? 0,
          ],
          [
            "Assigned to me",
            rows?.filter((x) => x.approver_user_id === ctx.user.id).length ?? 0,
          ],
        ].map(([k, v]) => (
          <div className="card" key={String(k)}>
            <p className="text-sm text-zinc-500">{k}</p>
            <p className="text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <form className="card flex flex-wrap items-center gap-2">
        <select className="field" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {statuses.map((x) => (
            <option key={x} value={x}>
              {titleCase(x)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} />
          Assigned to me
        </label>
        <button className="button">Filter</button>
      </form>

      <div className="grid gap-3">
        {!rows?.length ? (
          <div className="card text-zinc-500">No approvals match these filters.</div>
        ) : (
          rows.map((x) => (
            <Link className="card card-interactive block" href={`/app/approvals/${x.id}`} key={x.id}>
              <div className="flex justify-between gap-2">
                <strong>Workflow approval</strong>
                <span className="badge badge-muted">{titleCase(x.status)}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                Run {x.run_id.slice(0, 8)} ·{" "}
                {x.approver_role
                  ? titleCase(x.approver_role)
                  : x.approver_user_id
                    ? "Assigned person"
                    : "Unassigned"}
              </p>
              <p className="text-xs text-zinc-500">
                Due {x.due_at ? new Date(x.due_at).toLocaleString() : "not set"}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
