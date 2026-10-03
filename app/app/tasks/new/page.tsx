import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {WorkForm} from "@/components/work-form";
import {Notice} from "@/components/notice";
export default async function NewTask({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    [people, {data: cases}] = await Promise.all([
      organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
      ctx.supabase
        .from("work_cases")
        .select("id,case_number,title")
        .eq("organisation_id", ctx.organisation.id)
        .not("status", "in", "(closed,cancelled)")
        .limit(100),
    ]);
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href="/app/tasks">← Tasks</Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Create task</h1>
        <p className="text-zinc-600">
          Add something for your team to do, from scratch or from a template.
        </p>
      </div>
      <Notice searchParams={p} />
      <WorkForm
        kind="task"
        members={people.list.map((x) => ({user_id: x.userId, label: x.label}))}
        cases={cases ?? []}
        sourceType={typeof p.sourceType === "string" ? p.sourceType : undefined}
        sourceId={typeof p.sourceId === "string" ? p.sourceId : undefined}
      />
    </section>
  );
}
