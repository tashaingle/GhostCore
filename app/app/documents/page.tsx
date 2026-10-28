import Link from "next/link";
import {Download, FileText, Trash2, Upload} from "lucide-react";
import {deleteDocument} from "@/app/document-actions";
import {DocumentUploadForm} from "@/components/document-upload-form";
import {Notice} from "@/components/notice";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {sortProjects} from "@/lib/home/projects";

export const metadata = {title: "Documents"};

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const projects = sortProjects(ctx.organisations);
  const requested = typeof params.project === "string" ? params.project : ctx.organisation.id;
  const project = projects.find((item) => item.id === requested) ?? projects[0];
  const {data: documents} = project
    ? await ctx.supabase.from("organisation_documents").select("*").eq("organisation_id", project.id).order("created_at", {ascending: false})
    : {data: []};
  const canUpload = project ? hasPermission(project.role as OrganisationRole, "work.create") : false;
  const canDelete = project ? hasPermission(project.role as OrganisationRole, "work.manage") : false;

  return <div className="mm-page mx-auto max-w-6xl">
    <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Shared library</p><h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Documents</h1><p className="mt-1 text-sm text-zinc-500">Keep useful files together for each business.</p></header>
    <Notice searchParams={params} />
    <nav aria-label="Projects" className="mb-5 flex gap-2 overflow-x-auto pb-1">{projects.map((item) => <Link key={item.id} href={`/app/documents?project=${item.id}`} aria-current={item.id === project?.id ? "page" : undefined} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${item.id === project?.id ? "bg-zinc-950 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950"}`}>{item.name}</Link>)}</nav>
    {project ? <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="mm-panel h-fit rounded-2xl p-5 lg:sticky lg:top-5">
        <div className="flex items-center gap-2"><Upload aria-hidden className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-zinc-950">Upload a document</h2></div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">PDF, Word, Excel, PowerPoint, images, text, CSV or ZIP. Maximum 25 MB.</p>
        {canUpload ? <DocumentUploadForm organisationId={project.id} userId={ctx.user.id} /> : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">You have view-only access to this library.</p>}
      </aside>
      <section className="mm-panel rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">{project.name}</p><h2 className="mt-1 text-xl font-semibold text-zinc-950">{documents?.length ?? 0} document{documents?.length === 1 ? "" : "s"}</h2></div><FileText aria-hidden className="h-7 w-7 text-zinc-300" /></div>
        {documents?.length ? <div className="mt-5 divide-y divide-zinc-100">{documents.map((document) => <article key={document.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><h3 className="truncate font-semibold text-zinc-950">{document.title}</h3><p className="mt-1 truncate text-xs text-zinc-500">{document.file_name} · {sizeLabel(Number(document.size_bytes))} · {new Date(document.created_at).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"})}</p></div>
          <div className="flex shrink-0 gap-2"><Link className="button button-secondary" href={`/app/documents/${document.id}/download`}><Download aria-hidden className="h-4 w-4" />Download</Link>{canDelete ? <form action={deleteDocument}><input type="hidden" name="id" value={document.id} /><input type="hidden" name="organisationId" value={project.id} /><button className="button button-secondary text-rose-700" aria-label={`Delete ${document.title}`}><Trash2 aria-hidden className="h-4 w-4" />Delete</button></form> : null}</div>
        </article>)}</div> : <div className="mt-5 grid min-h-64 place-items-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 p-8 text-center"><div><FileText aria-hidden className="mx-auto h-9 w-9 text-zinc-300" /><p className="mt-3 font-semibold text-zinc-700">No documents yet</p><p className="mt-1 text-sm text-zinc-500">Upload the first useful file for {project.name}.</p></div></div>}
      </section>
    </div> : null}
  </div>;
}
