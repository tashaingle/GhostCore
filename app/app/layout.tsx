import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {signOut} from "@/app/actions";
import {OrganisationSwitcher} from "@/components/organisation-switcher";
const links=[["Command Centre","/app/command-centre"],["Action Centre","/app/action-centre"],["Workflows","/app/workflows"],["Approvals","/app/approvals"],["Overview","/app"],["Timeline","/app/timeline"],["Correlations","/app/correlations"],["Integrations","/app/integrations"],["Background Jobs","/app/jobs"],["Team","/app/team"],["Developer Tools","/app/developer"],["Organisation Settings","/app/settings"]];
export default async function AppLayout({children}:{children:React.ReactNode}){
  const ctx=await getActiveOrganisation(true);
  return <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]"><aside className="border-b bg-white p-5 md:border-b-0 md:border-r"><h1 className="font-bold">Ghost Core</h1>
    {ctx?<div className="my-4 space-y-3"><div className="flex items-center gap-2">{ctx.organisation.logo_url?<span className="h-9 w-9 rounded bg-cover bg-center" role="img" aria-label={`${ctx.organisation.name} logo`} style={{backgroundImage:`url("${ctx.organisation.logo_url.replaceAll('"','%22')}")`}}/>:<span className="grid h-9 w-9 place-items-center rounded bg-zinc-900 text-sm font-bold text-white">{ctx.organisation.name.slice(0,2).toUpperCase()}</span>}<div className="min-w-0"><p className="truncate text-sm font-semibold">{ctx.organisation.name}</p><p className="text-xs capitalize text-zinc-500">{ctx.membership.role}</p></div></div><OrganisationSwitcher activeId={ctx.organisation.id} organisations={ctx.organisations}/><Link className="block text-xs text-zinc-500 hover:text-zinc-950" href="/app/organisations/new">+ Create organisation</Link></div>:<p className="my-4 text-xs text-zinc-500">Setup required</p>}
    <nav className="flex gap-2 overflow-auto md:flex-col">{links.map(([label,href])=><Link key={href} className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100" href={href}>{label}</Link>)}</nav><form action={signOut} className="mt-6"><button className="text-sm text-zinc-500 hover:text-zinc-950">Sign out</button></form>
  </aside><main className="min-w-0 p-5 md:p-8">{children}</main></div>;
}
