import Link from "next/link";
import {CreditCard, LogOut, Menu, Plus, Settings} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {signOut} from "@/app/actions";
import {OrganisationSwitcher} from "@/components/organisation-switcher";
import {SidebarNav} from "@/components/sidebar-nav";
import {BrandMark} from "@/components/brand-mark";
import {roleLabel} from "@/lib/ui/labels";
import {redirect} from "next/navigation";
import {billingEnabled} from "@/lib/billing/stripe";

const initials = (text: string) =>
  text
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default async function AppLayout({children}: {children: React.ReactNode}) {
  const ctx = await getActiveOrganisation(true);
  // An organisation whose creator's subscription has lapsed is paused until it's renewed.
  if (ctx && billingEnabled()) {
    const {data: allowed} = await ctx.supabase.rpc("organisation_has_access", {
      target_organisation_id: ctx.organisation.id,
    });
    if (!allowed) redirect("/billing");
  }
  const fullName = (ctx?.user.user_metadata?.full_name as string | undefined)?.trim(),
    email = ctx?.user.email ?? "";

  return (
    <div className="min-h-screen bg-[#f5f7fb] md:grid md:grid-cols-[252px_1fr]">
      <aside className="relative hidden flex-col overflow-hidden bg-ink px-4 py-5 text-white md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-24 h-60 w-60 rounded-full bg-teal-400/10 blur-3xl" />
        <Link href="/app" className="flex items-center gap-2.5 px-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">Metric Mage</span>
        </Link>

        {ctx ? (
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] p-2.5 ring-1 ring-white/10 backdrop-blur">
              {ctx.organisation.logo_url ? (
                <span
                  className="h-9 w-9 shrink-0 rounded-xl bg-white bg-cover bg-center"
                  role="img"
                  aria-label={`${ctx.organisation.name} logo`}
                  style={{
                    backgroundImage: `url("${ctx.organisation.logo_url.replaceAll('"', "%22")}")`,
                  }}
                />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mage text-xs font-bold">
                  {ctx.organisation.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{ctx.organisation.name}</p>
                <p className="text-xs text-white/55">{roleLabel(ctx.membership.role)}</p>
              </div>
            </div>
            {ctx.organisations.length > 1 ? (
              <OrganisationSwitcher
                activeId={ctx.organisation.id}
                organisations={ctx.organisations}
              />
            ) : null}
            <Link
              className="flex items-center gap-1.5 px-2 pt-1 text-xs text-white/50 transition-colors hover:text-white"
              href="/app/organisations/new"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
              New organisation
            </Link>
          </div>
        ) : (
          <p className="mt-5 px-2 text-xs text-white/55">Create an organisation to continue.</p>
        )}

        <div className="relative mt-7 flex-1">
          <SidebarNav showAdvanced={["owner", "admin"].includes(ctx?.membership.role ?? "")} />
        </div>

        {ctx ? (
          <div className="relative mt-6 hidden rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 backdrop-blur md:block">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky to-mage text-sm font-semibold">
                {initials(fullName || email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{fullName || "Your account"}</p>
                <p className="truncate text-xs text-white/55">{email}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-1 border-t border-white/10 pt-2">
              {billingEnabled() ? (
                <Link
                  href="/billing"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <CreditCard aria-hidden className="h-3.5 w-3.5" />
                  Billing
                </Link>
              ) : null}
              <form action={signOut} className="flex-1">
                <button className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white">
                  <LogOut aria-hidden className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0">
        {ctx ? (
          <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-zinc-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl md:hidden">
            <details className="group">
              <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl bg-ink text-white [&::-webkit-details-marker]:hidden">
                <Menu aria-hidden className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </summary>
              <div className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-ink px-4 pb-6 pt-4 text-white shadow-2xl">
                <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
                  {ctx.organisation.logo_url ? (
                    <span
                      className="h-9 w-9 shrink-0 rounded-xl bg-white bg-cover bg-center"
                      role="img"
                      aria-label={`${ctx.organisation.name} logo`}
                      style={{
                        backgroundImage: `url("${ctx.organisation.logo_url.replaceAll('"', "%22")}")`,
                      }}
                    />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mage text-xs font-bold">
                      {ctx.organisation.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{ctx.organisation.name}</p>
                    <p className="text-xs text-white/55">{roleLabel(ctx.membership.role)}</p>
                  </div>
                </div>
                <SidebarNav
                  forceVertical
                  showAdvanced={["owner", "admin"].includes(ctx.membership.role)}
                />
                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
                  <Link
                    href="/app/organisations/new"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] px-3 py-2.5 text-sm text-white/75"
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                    New project
                  </Link>
                  <form action={signOut}>
                    <button
                      aria-label="Sign out"
                      className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07] text-white/75"
                    >
                      <LogOut aria-hidden className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            </details>
            <Link href="/app" className="mr-auto flex items-center gap-2.5">
              <BrandMark />
              <span className="text-sm font-semibold tracking-tight text-ink">Metric Mage</span>
            </Link>
            <Link
              href="/app/settings"
              aria-label="Settings"
              className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200/70 transition-colors hover:text-zinc-950"
            >
              <Settings aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            </Link>
          </header>
        ) : null}
        {ctx ? (
          <div className="hidden justify-end gap-2 px-8 pt-5 xl:px-12 md:flex">
            <Link
              href="/app/settings"
              aria-label="Settings"
              className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white shadow-sm transition-colors hover:bg-ink-soft"
            >
              <Settings aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            </Link>
          </div>
        ) : null}
        <main className="mm-grid-bg min-h-[calc(100vh-68px)] min-w-0 px-4 pb-12 pt-3 md:px-8 md:pt-1 xl:px-12">{children}</main>
      </div>
    </div>
  );
}
