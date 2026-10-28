import Link from "next/link";
import {ImageIcon, Palette, Save, Type} from "lucide-react";
import {saveBranding} from "@/app/branding-actions";
import {Notice} from "@/components/notice";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {sortProjects} from "@/lib/home/projects";

export const metadata = {title: "Branding"};

const defaults = {
  primary_logo_url: null,
  secondary_logo_url: null,
  icon_url: null,
  primary_color: "#2563eb",
  secondary_color: "#111827",
  accent_color: "#14b8a6",
  heading_font: "Inter",
  body_font: "Inter",
  notes: "",
};

function LogoPreview({url, label}: {url: string | null; label: string}) {
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p>{url ? <div role="img" aria-label={label} className="mt-3 h-24 rounded-xl bg-contain bg-center bg-no-repeat" style={{backgroundImage: `url("${url.replaceAll('"', '%22')}")`}} /> : <div className="mt-3 grid h-24 place-items-center rounded-xl bg-zinc-50 text-zinc-300"><ImageIcon aria-hidden className="h-7 w-7" /></div>}</div>;
}

export default async function BrandingPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const projects = sortProjects(ctx.organisations);
  const requested = typeof params.project === "string" ? params.project : ctx.organisation.id;
  const project = projects.find((item) => item.id === requested) ?? projects[0];
  const {data} = project ? await ctx.supabase.from("organisation_branding").select("*").eq("organisation_id", project.id).maybeSingle() : {data: null};
  const brand = data ?? defaults;

  return (
    <div className="mm-page mx-auto max-w-6xl">
      <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Brand library</p><h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Branding</h1><p className="mt-1 text-sm text-zinc-500">Keep every project&apos;s logos, colours and typography together.</p></header>
      <Notice searchParams={params} />
      <nav aria-label="Projects" className="mb-5 flex gap-2 overflow-x-auto pb-1">{projects.map((item) => <Link key={item.id} href={`/app/branding?project=${item.id}`} aria-current={item.id === project?.id ? "page" : undefined} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${item.id === project?.id ? "bg-zinc-950 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950"}`}>{item.name}</Link>)}</nav>
      {project ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={saveBranding} className="mm-panel rounded-2xl p-5 md:p-6">
          <input type="hidden" name="organisationId" value={project.id} />
          <section><div className="flex items-center gap-2"><ImageIcon aria-hidden className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-zinc-950">Logos</h2></div><p className="mt-1 text-xs text-zinc-500">Paste secure image links from your website, Drive share, or asset library.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="label">Primary logo URL<input className="field" type="url" name="primaryLogoUrl" defaultValue={brand.primary_logo_url ?? ""} placeholder="https://…/logo.png" /></label><label className="label">Secondary logo URL<input className="field" type="url" name="secondaryLogoUrl" defaultValue={brand.secondary_logo_url ?? ""} placeholder="https://…/logo-light.png" /></label><label className="label md:col-span-2">App icon / favicon URL<input className="field" type="url" name="iconUrl" defaultValue={brand.icon_url ?? ""} placeholder="https://…/icon.png" /></label></div></section>
          <section className="mt-7 border-t border-zinc-100 pt-6"><div className="flex items-center gap-2"><Palette aria-hidden className="h-5 w-5 text-violet-600" /><h2 className="font-semibold text-zinc-950">Colour scheme</h2></div><div className="mt-4 grid gap-4 sm:grid-cols-3">{[{name:"primaryColor",label:"Primary",value:brand.primary_color},{name:"secondaryColor",label:"Secondary",value:brand.secondary_color},{name:"accentColor",label:"Accent",value:brand.accent_color}].map((colour) => <label key={colour.name} className="label">{colour.label}<span className="flex items-center gap-2"><input type="color" name={colour.name} defaultValue={colour.value} className="h-11 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1" /><span className="font-mono text-xs uppercase text-zinc-500">{colour.value}</span></span></label>)}</div></section>
          <section className="mt-7 border-t border-zinc-100 pt-6"><div className="flex items-center gap-2"><Type aria-hidden className="h-5 w-5 text-emerald-600" /><h2 className="font-semibold text-zinc-950">Typography</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="label">Heading font<input className="field" name="headingFont" list="brand-fonts" defaultValue={brand.heading_font} maxLength={100} /></label><label className="label">Body font<input className="field" name="bodyFont" list="brand-fonts" defaultValue={brand.body_font} maxLength={100} /></label><datalist id="brand-fonts"><option value="Inter" /><option value="Poppins" /><option value="Montserrat" /><option value="Playfair Display" /><option value="Lato" /><option value="Roboto" /><option value="Open Sans" /></datalist></div></section>
          <section className="mt-7 border-t border-zinc-100 pt-6"><label className="label">Brand notes<textarea className="field min-h-28 resize-y" name="notes" maxLength={5000} defaultValue={brand.notes} placeholder="Tone of voice, spacing rules, logo do's and don'ts…" /></label></section>
          <button className="button mt-5"><Save aria-hidden className="h-4 w-4" />Save brand library</button>
        </form>
        <aside className="mm-panel h-fit rounded-2xl p-5 xl:sticky xl:top-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Brand preview</p><h2 className="mt-1 text-xl font-semibold text-zinc-950">{project.name}</h2><div className="mt-4 grid gap-3"><LogoPreview url={brand.primary_logo_url} label="Primary logo" /><LogoPreview url={brand.secondary_logo_url} label="Secondary logo" /></div><div className="mt-4 flex overflow-hidden rounded-2xl ring-1 ring-zinc-200">{[brand.primary_color,brand.secondary_color,brand.accent_color].map((colour) => <div key={colour} className="h-20 flex-1" style={{backgroundColor: colour}}><span className="sr-only">{colour}</span></div>)}</div><div className="mt-5 rounded-2xl bg-zinc-50 p-4"><p className="text-2xl font-semibold text-zinc-950" style={{fontFamily: brand.heading_font}}>{brand.heading_font}</p><p className="mt-2 text-sm leading-6 text-zinc-600" style={{fontFamily: brand.body_font}}>Body copy uses {brand.body_font}. Clear, consistent and recognisably yours.</p></div>{brand.notes ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-500">{brand.notes}</p> : null}</aside>
      </div> : null}
    </div>
  );
}
