import {DATE_TIME} from "@/lib/ui/dates";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {approvalAction} from "@/app/workflow-actions";
import {organisationPeople} from "@/lib/organisations/people";
import {roleLabel} from "@/lib/ui/labels";
export default async function ApprovalDetail({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    {id} = await params,
    p = await searchParams,
    {data: item} = await ctx.supabase
      .from("workflow_approvals")
      .select("*")
      .eq("id", id)
      .eq("organisation_id", ctx.organisation.id)
      .maybeSingle();
  if (!item) notFound();
  const [{data: run}, {data: step}] = await Promise.all([
      ctx.supabase
        .from("workflow_runs")
        .select("*")
        .eq("id", item.run_id)
        .eq("organisation_id", ctx.organisation.id)
        .maybeSingle(),
      ctx.supabase
        .from("workflow_run_steps")
        .select("*")
        .eq("id", item.run_step_id)
        .eq("organisation_id", ctx.organisation.id)
        .maybeSingle(),
    ]),
    [{data: workflow}, {data: stepDefinition}, people] = await Promise.all([
      run
        ? ctx.supabase
            .from("workflow_definitions")
            .select("id,name")
            .eq("id", run.workflow_id)
            .eq("organisation_id", ctx.organisation.id)
            .maybeSingle()
        : Promise.resolve({data: null}),
      step
        ? ctx.supabase
            .from("workflow_steps")
            .select("name")
            .eq("id", step.step_id)
            .eq("organisation_id", ctx.organisation.id)
            .maybeSingle()
        : Promise.resolve({data: null}),
      organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
    ]),
    canDecide =
      hasPermission(ctx.membership.role as OrganisationRole, "approvals.decide") &&
      item.status === "pending",
    who = item.approver_user_id
      ? people.name(item.approver_user_id)
      : item.approver_role
        ? `Any ${roleLabel(item.approver_role).toLowerCase()}`
        : "Anyone on the team",
    STATUS: Record<string, string> = {
      pending: "Waiting for an answer",
      approved: "Approved",
      rejected: "Turned down",
      expired: "Expired",
      cancelled: "Cancelled",
    };
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/approvals">
        ← Approvals
      </Link>
      <Notice searchParams={p} />
      <div className="card space-y-4">
        <div>
          <p className="text-sm text-zinc-500">
            {workflow ? `From the "${workflow.name}" automation` : "Approval request"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {stepDefinition?.name ?? "Approval needed"}
          </h1>
          <p className="mt-1 font-medium text-zinc-700">{STATUS[item.status] ?? item.status}</p>
        </div>
        <p className="text-sm text-zinc-600">
          The automation is paused at this step. Approving lets it carry on to the next step;
          turning it down stops it.
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Who can answer</dt>
            <dd>{who}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Answer needed by</dt>
            <dd>
              {item.due_at
                ? new Date(item.due_at).toLocaleString("en-GB", DATE_TIME)
                : "No deadline"}
            </dd>
          </div>
          {item.decided_at ? (
            <div>
              <dt className="text-zinc-500">Answered</dt>
              <dd>
                {`${new Date(item.decided_at).toLocaleString("en-GB", DATE_TIME)}${
                  item.decided_by ? ` by ${people.name(item.decided_by)}` : ""
                }`}
              </dd>
            </div>
          ) : null}
        </dl>
        {item.decision_comment && (
          <p className="text-sm">
            <strong>Comment:</strong> {item.decision_comment}
          </p>
        )}
        {workflow ? (
          <Link
            className="text-sm text-violet-700 hover:underline"
            href={`/app/workflows/${workflow.id}`}
          >
            See the automation&apos;s steps
          </Link>
        ) : null}
      </div>
      {canDecide && (
        <form action={approvalAction} className="card space-y-3">
          <input type="hidden" name="id" value={item.id} />
          <label className="block">
            Comment <span className="text-zinc-400">(optional)</span>
            <textarea
              className="field mt-1 w-full"
              name="comment"
              placeholder="For example, why you're turning it down"
            />
          </label>
          <div className="flex gap-2">
            <button className="button" name="decision" value="approved">
              Approve
            </button>
            <button className="button button-secondary" name="decision" value="rejected">
              Turn down
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
