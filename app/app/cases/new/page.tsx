import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {WorkForm} from "@/components/work-form";
import {Notice} from "@/components/notice";
export default async function NewCase({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    people = await organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id);
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href="/app/cases">← Cases</Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Create case</h1>
        <p className="text-zinc-600">
          Open a case to track a bigger issue, like a customer complaint or an outage, and the tasks
          that go with it.
        </p>
      </div>
      <Notice searchParams={p} />
      <WorkForm
        kind="case"
        members={people.list.map((x) => ({user_id: x.userId, label: x.label}))}
        sourceType={typeof p.sourceType === "string" ? p.sourceType : undefined}
        sourceId={typeof p.sourceId === "string" ? p.sourceId : undefined}
      />
    </section>
  );
}
