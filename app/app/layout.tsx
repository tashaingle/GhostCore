import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {signOut} from "@/app/actions";
import {OrganisationSwitcher} from "@/components/organisation-switcher";

const primary = [
  ["Command Centre", "/app/command-centre"],
  ["Timeline", "/app/timeline"],
  ["Action Centre", "/app/action-centre"],
  ["Integrations", "/app/integrations"],
] as const;

const operate = [
  ["Work", "/app/work"],
  ["Workflows", "/app/workflows"],
  ["Approvals", "/app/approvals"],
  ["Correlations", "/app/correlations"],
] as const;

const admin = [
  ["Team", "/app/team"],
  ["Background Jobs", "/app/jobs"],
  ["Developer Tools", "/app/developer"],
  ["Settings", "/app/settings"],
] as const;

function NavGroup({
  title,
  links,
}: {
  title: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <p className="nav-section">{title}</p>
      <nav className="flex gap-1 overflow-auto md:flex-col">
        {links.map(([label, href]) => (
          <Link key={href} className="nav-link whitespace-nowrap" href={href}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getActiveOrganisation(true);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      <aside className="border-b border-zinc-200 bg-white p-5 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-xs font-bold text-white">
            G
          </span>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Ghost Core</h1>
            <p className="text-[11px] text-zinc-500">Ops intelligence</p>
          </div>
        </div>

        {ctx ? (
          <div className="my-5 space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
              {ctx.organisation.logo_url ? (
                <span
                  className="h-9 w-9 rounded-lg bg-cover bg-center"
                  role="img"
                  aria-label={`${ctx.organisation.name} logo`}
                  style={{
                    backgroundImage: `url("${ctx.organisation.logo_url.replaceAll('"', "%22")}")`,
                  }}
                />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
                  {ctx.organisation.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {ctx.organisation.name}
                </p>
                <p className="text-xs capitalize text-zinc-500">
                  {ctx.membership.role}
                </p>
              </div>
            </div>
            <OrganisationSwitcher
              activeId={ctx.organisation.id}
              organisations={ctx.organisations}
            />
            <Link
              className="block px-1 text-xs text-zinc-500 hover:text-zinc-950"
              href="/app/organisations/new"
            >
              + Create organisation
            </Link>
          </div>
        ) : (
          <p className="my-5 text-xs text-zinc-500">
            Create an organisation to continue.
          </p>
        )}

        <div className="space-y-1">
          <NavGroup title="Home" links={primary} />
          <NavGroup title="Operate" links={operate} />
          <NavGroup title="Admin" links={admin} />
        </div>

        <form action={signOut} className="mt-8 border-t border-zinc-100 pt-4">
          <button className="nav-link w-full text-left text-zinc-500">
            Sign out
          </button>
        </form>
      </aside>

      <main className="min-w-0 p-5 md:p-8">{children}</main>
    </div>
  );
}
