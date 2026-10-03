import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {WorkList} from "@/components/work-list";
import {WorkFilters} from "@/components/work-filters";
import {Notice} from "@/components/notice";
const value = (p: Record<string, string | string[] | undefined>, k: string) =>
  typeof p[k] === "string" ? (p[k] as string) : "";
export default async function Cases({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    people = await organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
    p = await searchParams,
    v = {
      q: value(p, "q").slice(0, 100),
      status: value(p, "status"),
      priority: value(p, "priority"),
      source: value(p, "source"),
      assignment: value(p, "assignment"),
      due: "",
    };
  let q = ctx.supabase
    .from("work_cases")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .limit(200);
  if (v.status) q = q.eq("status", v.status);
  if (v.priority) q = q.eq("priority", v.priority);
  if (v.source) q = q.eq("source_type", v.source);
  if (v.assignment === "me") q = q.eq("assigned_user_id", ctx.user.id);
  if (v.assignment === "unassigned") q = q.is("assigned_user_id", null);
  if (v.q) {
    const safe = v.q.replace(/[%(),]/g, "");
    q = q.or(
      `case_number.ilike.%${safe}%,title.ilike.%${safe}%,summary.ilike.%${safe}%,source_id.ilike.%${safe}%`,
    );
  }
  const {data} = await q;
  return (
    <section className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Cases</h1>
          <p className="text-zinc-600">
            Bigger issues your team is handling, each with its own tasks, notes and people involved.
          </p>
        </div>
        <Link className="button" href="/app/cases/new">
          New case
        </Link>
      </div>
      <Notice searchParams={p} />
      <WorkFilters kind="case" values={v} />
      <WorkList
        items={(data ?? []).map((x) => ({
          id: x.id,
          kind: "case",
          title: x.title,
          status: x.status,
          priority: x.priority as "low" | "normal" | "high" | "critical",
          dueAt: null,
          createdAt: x.created_at,
          assignee: x.assigned_user_id ? people.name(x.assigned_user_id) : null,
          owner: x.owner_user_id ? people.name(x.owner_user_id) : null,
          caseNumber: x.case_number,
          sourceType: x.source_type,
          updatedAt: x.updated_at,
        }))}
      />
    </section>
  );
}
