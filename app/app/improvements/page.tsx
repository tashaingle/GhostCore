import {Bug, CheckCircle2, CircleDot, Globe2, Plus, Smartphone, Sparkles} from "lucide-react";
import {addImprovement, deleteImprovement, setImprovementStatus} from "@/app/improvement-actions";
import {BusinessPicker} from "@/components/business-picker";
import {ConfirmDeleteButton} from "@/components/confirm-delete-button";
import {Notice} from "@/components/notice";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {sortProjects} from "@/lib/home/projects";

export const metadata = {title: "Improvements"};

const STATUS = {
  open: {label: "To review", className: "bg-zinc-100 text-zinc-700"},
  in_progress: {label: "In progress", className: "bg-amber-50 text-amber-700"},
  completed: {label: "Done", className: "bg-emerald-50 text-emerald-700"},
} as const;
const PRIORITY = {
  low: {label: "Low", className: "text-zinc-500"},
  normal: {label: "Normal", className: "text-blue-600"},
  high: {label: "High", className: "text-amber-600"},
  critical: {label: "Urgent", className: "text-rose-600"},
} as const;

export default async function ImprovementsPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const allProjects = sortProjects(ctx.organisations);
  // One business when picked at the top, otherwise every business in the workspace.
  const selected = allProjects.find((project) => project.id === params.project) ?? null;
  const projects = selected ? [selected] : allProjects;
  const returnTo = selected ? `/app/improvements?project=${selected.id}` : "/app/improvements";
  const back = <input type="hidden" name="returnTo" value={returnTo} />;
  const ids = projects.map((project) => project.id);
  const names = new Map(allProjects.map((project) => [project.id, project.name]));
  const {data} = ids.length ? await ctx.supabase.from("work_tasks").select("id,organisation_id,title,description,status,priority,metadata_json,created_at").in("organisation_id", ids).eq("source_type", "improvement").in("status", ["open", "in_progress", "completed"]).order("created_at", {ascending: false}).limit(200) : {data: []};
  const items = (data ?? []).map((item) => {
    const metadata = item.metadata_json && typeof item.metadata_json === "object" && !Array.isArray(item.metadata_json) ? item.metadata_json as Record<string, unknown> : {};
    return {...item, area: metadata.area === "website" ? "website" as const : "app" as const};
  });
  const counts = {open: items.filter((item) => item.status === "open").length, doing: items.filter((item) => item.status === "in_progress").length, done: items.filter((item) => item.status === "completed").length};

  return (
    <div className="mm-page mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Make it better</p><h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Improvements</h1><p className="mt-1 text-sm text-zinc-500">Keep app and website fixes in one clear shared list.</p></div><a href="#add-improvement" className="button rounded-xl"><Plus aria-hidden className="h-4 w-4" />Add improvement</a></header>
      <div className="mb-5 space-y-3">
        <BusinessPicker
          businesses={allProjects}
          selectedId={selected?.id ?? null}
          href={(id) => (id ? `/app/improvements?project=${id}` : "/app/improvements")}
          allLabel="All businesses"
        />
        <Notice searchParams={params} />
      </div>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        {[{label:"To review",value:counts.open,icon:Bug,tone:"bg-blue-50 text-blue-600"},{label:"In progress",value:counts.doing,icon:CircleDot,tone:"bg-amber-50 text-amber-600"},{label:"Completed",value:counts.done,icon:CheckCircle2,tone:"bg-emerald-50 text-emerald-600"}].map((item) => <article key={item.label} className="mm-panel flex items-center gap-4 rounded-2xl p-4"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${item.tone}`}><item.icon aria-hidden className="h-[18px] w-[18px]" /></span><div><p className="text-2xl font-semibold tabular-nums text-zinc-950">{item.value}</p><p className="text-xs text-zinc-500">{item.label}</p></div></article>)}
      </section>
      <details id="add-improvement" className="mm-panel group mb-5 rounded-2xl p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Sparkles aria-hidden className="h-5 w-5" /></span><div><h2 className="font-semibold text-zinc-950">Add something to improve</h2><p className="text-xs text-zinc-500">Capture it now so it does not get forgotten.</p></div></div><span className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white">New item</span></summary>
        <form action={addImprovement} className="mt-5 grid gap-4 border-t border-zinc-100 pt-5 md:grid-cols-2">{back}
          <label className="label md:col-span-2">What needs changing?<input className="field" name="title" maxLength={200} placeholder="Make the sign-up button easier to find" required /></label>
          <label className="label">Project<select className="field" name="organisationId" defaultValue={selected?.id ?? ctx.organisation.id}>{allProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="label">Area<select className="field" name="area" defaultValue="app"><option value="app">App</option><option value="website">Website</option></select></label>
          <label className="label">Priority<select className="field" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Urgent</option></select></label>
          <label className="label md:col-span-2">Details<textarea className="field min-h-24 resize-y" name="description" maxLength={4000} placeholder="What is wrong now, and what would better look like?" /></label>
          <button className="button justify-center md:col-span-2 md:justify-self-start"><Plus aria-hidden className="h-4 w-4" />Add improvement</button>
        </form>
      </details>
      {items.length ? <section className="grid gap-4 lg:grid-cols-2">{items.map((item) => {
        const status = STATUS[item.status as keyof typeof STATUS] ?? STATUS.open;
        const priority = PRIORITY[item.priority as keyof typeof PRIORITY] ?? PRIORITY.normal;
        const AreaIcon = item.area === "website" ? Globe2 : Smartphone;
        return <article key={item.id} className="mm-panel rounded-2xl p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${item.area === "website" ? "bg-sky-50 text-sky-600" : "bg-violet-50 text-violet-600"}`}><AreaIcon aria-hidden className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-medium text-zinc-400">{names.get(item.organisation_id)} · {item.area === "website" ? "Website" : "App"}</p><h2 className="mt-1 font-semibold text-zinc-950">{item.title}</h2></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></div>{item.description ? <p className="mt-4 text-sm leading-6 text-zinc-600">{item.description}</p> : null}<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4"><span className={`text-xs font-semibold ${priority.className}`}>{priority.label} priority</span><div className="flex items-center gap-2"><form action={setImprovementStatus} className="flex rounded-xl bg-zinc-100 p-1">{back}<input type="hidden" name="id" value={item.id} /><input type="hidden" name="organisationId" value={item.organisation_id} />{[{value:"open",label:"Review"},{value:"in_progress",label:"Doing"},{value:"completed",label:"Done"}].map((choice) => <button key={choice.value} name="status" value={choice.value} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${item.status === choice.value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500"}`}>{choice.label}</button>)}</form><form action={deleteImprovement}>{back}<input type="hidden" name="id" value={item.id} /><input type="hidden" name="organisationId" value={item.organisation_id} /><ConfirmDeleteButton label={`Delete ${item.title}`} compact /></form></div></div></article>;
      })}</section> : <section className="mm-panel rounded-2xl px-6 py-14 text-center"><Sparkles aria-hidden className="mx-auto h-8 w-8 text-zinc-300" /><h2 className="mt-3 font-semibold text-zinc-900">Nothing logged yet</h2><p className="mt-1 text-sm text-zinc-500">Add the first app or website improvement above.</p></section>}
    </div>
  );
}
