import Link from "next/link";
import {CreditCard, LogOut, Plus} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {signOut} from "@/app/actions";
import {OrganisationSwitcher} from "@/components/organisation-switcher";
import {SidebarNav} from "@/components/sidebar-nav";
import {BrandMark} from "@/components/brand-mark";
import {roleLabel} from "@/lib/ui/labels";
import {redirect} from "next/navigation";
import {billingEnabled} from "@/lib/billing/stripe";

export default async function AppLayout({children}: {children: React.ReactNode}) {
  const ctx = await getActiveOrganisation(true);
  // An organisation whose creator's subscription has lapsed is paused until it's renewed.
  if (ctx && billingEnabled()) {
    const {data: allowed} = await ctx.supabase.rpc("organisation_has_access", {
      target_organisation_id: ctx.organisation.id,
    });
    if (!allowed) redirect("/billing");
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_1fr]">
      <aside className="flex flex-col border-b border-zinc-200/80 bg-white/90 px-4 py-5 backdrop-blur md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <Link href="/app" className="flex items-center gap-2.5 px-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-zinc-950">
            Metric Mage
          </span>
        </Link>

        {ctx ? (
          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-2">
              {ctx.organisation.logo_url ? (
                <span
                  className="h-8 w-8 shrink-0 rounded-lg bg-cover bg-center"
                  role="img"
                  aria-label={`${ctx.organisation.name} logo`}
                  style={{
                    backgroundImage: `url("${ctx.organisation.logo_url.replaceAll('"', "%22")}")`,
                  }}
                />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-zinc-700 ring-1 ring-zinc-200">
                  {ctx.organisation.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {ctx.organisation.name}
                </p>
                <p className="text-xs text-zinc-500">{roleLabel(ctx.membership.role)}</p>
              </div>
            </div>
            {ctx.organisations.length > 1 ? (
              <OrganisationSwitcher
                activeId={ctx.organisation.id}
                organisations={ctx.organisations}
              />
            ) : null}
            <Link
              className="flex items-center gap-1.5 px-2 text-xs text-zinc-500 transition-colors hover:text-zinc-900"
              href="/app/organisations/new"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
              New organisation
            </Link>
          </div>
        ) : (
          <p className="mt-5 px-2 text-xs text-zinc-500">Create an organisation to continue.</p>
        )}

        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-3">
          {billingEnabled() ? (
            <Link
              href="/billing"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              <CreditCard aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Billing
            </Link>
          ) : null}
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
              <LogOut aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 md:px-10 md:py-9">{children}</main>
    </div>
  );
}
