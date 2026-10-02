import {getActiveOrganisation} from "@/lib/organisations/active";
import {builtInWorkTemplates} from "@/lib/work/templates";
export default async function WorkTemplates() {
  const ctx = await getActiveOrganisation(),
    {data} = await ctx.supabase
      .from("work_templates")
      .select("*")
      .or(`organisation_id.is.null,organisation_id.eq.${ctx.organisation.id}`)
      .eq("enabled", true)
      .order("name");
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Work templates</h1>
        <p className="text-zinc-600">
          Ready-made tasks and cases you can reuse, with checklists filled in.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ...builtInWorkTemplates,
          ...(data ?? []).map((x) => ({
            key: x.id,
            type: x.template_type,
            name: x.name,
            description: x.description,
            priority: x.default_priority,
            configuration: x.configuration_json,
          })),
        ].map((x) => (
          <article className="card" key={x.key}>
            <p className="text-xs uppercase text-zinc-500">{x.type.replaceAll("_", " ")}</p>
            <h3 className="font-semibold">{x.name}</h3>
            <p className="mt-2 text-sm">{x.description}</p>
            <p className="mt-3 text-xs capitalize text-zinc-500">Default priority: {x.priority}</p>
          </article>
        ))}
      </div>
      <p className="text-sm text-zinc-500">
        Only owners and admins can edit templates. Built-in templates can’t be changed, but you can
        copy them.
      </p>
    </section>
  );
}
