import {DATE_TIME} from "@/lib/ui/dates";
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
  // Name each approval after its step, like "Ask an owner to approve".
  const {data: runSteps} = rows?.length
      ? await ctx.supabase
          .from("workflow_run_steps")
          .select("id,step_id")
          .eq("organisation_id", ctx.organisation.id)
          .in(
            "id",
            rows.map((x) => x.run_step_id),
          )
      : {data: []},
    {data: stepNames} = runSteps?.length
      ? await ctx.supabase
          .from("workflow_steps")
          .select("id,name")
          .eq("organisation_id", ctx.organisation.id)
          .in(
            "id",
            runSteps.map((x) => x.step_id),
          )
      : {data: []},
    nameOf = (runStepId: string) => {
      const stepId = runSteps?.find((x) => x.id === runStepId)?.step_id;
      return stepNames?.find((x) => x.id === stepId)?.name ?? "Approval needed";
    },
    STATUS: Record<string, string> = {
      pending: "Waiting",
      approved: "Approved",
      rejected: "Turned down",
      expired: "Expired",
      cancelled: "Cancelled",
    };

  return (
    <section className="space-y-6">
      <PageHeader
        title="Approvals"
        description="When an automation needs a yes or no from someone before it carries on, it waits here."
      />
      <Notice searchParams={p} />

      <form className="card flex flex-wrap items-center gap-2">
        <select className="field" name="status" defaultValue={status}>
          <option value="">All</option>
          {statuses.map((x) => (
            <option key={x} value={x}>
              {STATUS[x]}
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
          <div className="card text-zinc-500">
            {status === "pending" ? "Nothing is waiting for an answer." : "No approvals here."}
          </div>
        ) : (
          rows.map((x) => (
            <Link
              className="card card-interactive block"
              href={`/app/approvals/${x.id}`}
              key={x.id}
            >
              <div className="flex justify-between gap-2">
                <strong>{nameOf(x.run_step_id)}</strong>
                <span className="badge badge-muted">{STATUS[x.status] ?? titleCase(x.status)}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                {x.approver_user_id === ctx.user.id
                  ? "For you"
                  : x.approver_role
                    ? `For any ${x.approver_role}`
                    : x.approver_user_id
                      ? "For someone else"
                      : "For anyone on the team"}
              </p>
              <p className="text-xs text-zinc-500">
                {x.due_at
                  ? `Answer needed by ${new Date(x.due_at).toLocaleString("en-GB", DATE_TIME)}`
                  : "No deadline"}
              </p>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
