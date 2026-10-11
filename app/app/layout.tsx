import Link from "next/link";
import {Bell, CreditCard, LogOut, Plus, Settings} from "lucide-react";
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
  // Things waiting for a person: open alerts plus approvals. Shown on the bell.
  const [{count: alerts}, {count: approvals}] = ctx
    ? await Promise.all([
        ctx.supabase
          .from("notifications")
          .select("id", {count: "exact", head: true})
          .eq("organisation_id", ctx.organisation.id)
          .eq("status", "open"),
        ctx.supabase
          .from("workflow_approvals")
          .select("id", {count: "exact", head: true})
          .eq("organisation_id", ctx.organisation.id)
          .eq("status", "pending"),
      ])
    : [{count: 0}, {count: 0}];
  const waiting = (alerts ?? 0) + (approvals ?? 0),
    fullName = (ctx?.user.user_metadata?.full_name as string | undefined)?.trim(),
    email = ctx?.user.email ?? "";

  return (
    <div className="min-h-screen bg-[#f4f5f9] md:grid md:grid-cols-[268px_1fr]">
      <aside className="flex flex-col bg-ink px-4 py-5 text-white md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <Link href="/app" className="flex items-center gap-2.5 px-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">Metric Mage</span>
        </Link>

        {ctx ? (
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10">
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

        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>

        {ctx ? (
          <div className="mt-6 hidden rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10 md:block">
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
          <div className="flex justify-end gap-2 px-4 pt-4 md:px-10 md:pt-6">
            {/* On phones the account card is hidden, so sign out lives up here. */}
            <form action={signOut} className="md:hidden">
              <button
                aria-label="Sign out"
                className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200/70"
              >
                <LogOut aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </form>
            <Link
              href="/app/action-centre"
              aria-label={waiting ? `Action Centre: ${waiting} waiting` : "Action Centre"}
              className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200/70 transition-colors hover:text-zinc-950"
            >
              <Bell aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              {waiting ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-mage px-1 text-[11px] font-semibold text-white ring-2 ring-[#f4f5f9]">
                  {waiting > 99 ? "99+" : waiting}
                </span>
              ) : null}
            </Link>
            <Link
              href="/app/settings"
              aria-label="Settings"
              className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white shadow-sm transition-colors hover:bg-ink-soft"
            >
              <Settings aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            </Link>
          </div>
        ) : null}
        <main className="min-w-0 px-4 pb-10 pt-2 md:px-10 md:pt-0">{children}</main>
      </div>
    </div>
  );
}
