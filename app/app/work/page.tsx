import Link from "next/link";
import {PageHeader} from "@/components/page-header";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {WorkList} from "@/components/work-list";
import {Notice} from "@/components/notice";
export default async function WorkInbox({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    people = await organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
    p = await searchParams,
    tab = typeof p.tab === "string" ? p.tab : "assigned";
  const now = new Date(),
    soon = new Date(
      now.getTime() + (Number(process.env.WORK_DUE_SOON_HOURS) || 24) * 3600000,
    ).toISOString();
  let tasks = ctx.supabase
      .from("work_tasks")
      .select("*")
      .eq("organisation_id", ctx.organisation.id)
      .limit(200),
    cases = ctx.supabase
      .from("work_cases")
      .select("*")
      .eq("organisation_id", ctx.organisation.id)
      .limit(100);
  if (tab === "assigned") {
    tasks = tasks.eq("assigned_user_id", ctx.user.id);
    cases = cases.eq("assigned_user_id", ctx.user.id);
  }
  if (tab === "unassigned") {
    tasks = tasks.is("assigned_user_id", null);
    cases = cases.is("assigned_user_id", null);
  }
  if (tab === "blocked") tasks = tasks.eq("status", "blocked");
  if (tab === "waiting") {
    tasks = tasks.eq("status", "waiting");
    cases = cases.eq("status", "waiting");
  }
  if (tab === "critical") {
    tasks = tasks.eq("priority", "critical");
    cases = cases.eq("priority", "critical");
  }
  if (tab === "overdue")
    tasks = tasks.lt("due_at", now.toISOString()).not("status", "in", "(completed,cancelled)");
  if (tab === "due-soon")
    tasks = tasks
      .gte("due_at", now.toISOString())
      .lte("due_at", soon)
      .not("status", "in", "(completed,cancelled)");
  if (tab === "cases") tasks = tasks.limit(0);
  const [{data: t}, {data: c}] = await Promise.all([tasks, cases]);
  const items = [
    ...(t ?? []).map((x) => ({
      id: x.id,
      kind: "task" as const,
      title: x.title,
      status: x.status,
      priority: x.priority as "low" | "normal" | "high" | "critical",
      dueAt: x.due_at,
      createdAt: x.created_at,
      assignee: x.assigned_user_id ? people.name(x.assigned_user_id) : null,
      owner: x.owner_user_id ? people.name(x.owner_user_id) : null,
      sourceType: x.source_type,
      updatedAt: x.updated_at,
    })),
    ...(c ?? []).map((x) => ({
      id: x.id,
      kind: "case" as const,
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
    })),
  ];
  return (
    <section className="space-y-6">
      <PageHeader
        title="Work"
        description="Tasks and cases your team is working on. A case groups related tasks, like a customer complaint or an outage. Automations can create them for you."
        actions={
          <>
            <Link className="button button-secondary" href="/app/cases/new">
              New case
            </Link>
            <Link className="button" href="/app/tasks/new">
              New task
            </Link>
          </>
        }
      />
      <Notice searchParams={p} />
      <nav className="flex flex-wrap gap-1 rounded-xl bg-zinc-200/60 p-1" aria-label="Work views">
        {[
          ["assigned", "Assigned to me"],
          ["unassigned", "Unassigned"],
          ["due-soon", "Due soon"],
          ["overdue", "Overdue"],
          ["blocked", "Blocked"],
          ["waiting", "Waiting"],
          ["critical", "Critical"],
          ["cases", "Open cases"],
          ["all", "All work"],
        ].map(([k, l]) => (
          <Link
            key={k}
            href={`/app/work?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === k ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            {l}
          </Link>
        ))}
      </nav>
      <WorkList items={items} />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
        <Link className="hover:text-zinc-950" href="/app/tasks">
          All tasks
        </Link>
        <Link className="hover:text-zinc-950" href="/app/cases">
          All cases
        </Link>
        <Link className="hover:text-zinc-950" href="/app/work/templates">
          Templates
        </Link>
        <Link className="hover:text-zinc-950" href="/app/work/views">
          Saved views
        </Link>
      </div>
    </section>
  );
}
