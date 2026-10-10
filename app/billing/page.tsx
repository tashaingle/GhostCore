import Link from "next/link";
import {CreditCard} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {switchOrganisation} from "@/app/organisation-actions";
import {signOut} from "@/app/actions";
import {BrandMark} from "@/components/brand-mark";
import {Notice} from "@/components/notice";
import {describePrice, hasAccess, PLAN} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, ownedOrganisations} from "@/lib/billing/stripe";

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", {day: "numeric", month: "long"}) : "";

/** Your plan, plus what's happening with the organisation you're looking at. */
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(true);
  if (!ctx) return null;
  const enabled = billingEnabled(),
    [account, owned] = await Promise.all([
      billingAccount(ctx.user.id),
      ownedOrganisations(ctx.user.id),
    ]),
    mine = ctx.organisation.created_by === ctx.user.id,
    {data: orgAccess} = await ctx.supabase.rpc("organisation_has_access", {
      target_organisation_id: ctx.organisation.id,
    }),
    paused = enabled && !orgAccess,
    owner = mine
      ? null
      : (await organisationPeople(ctx.supabase, ctx.organisation.id)).name(
          ctx.organisation.created_by,
          "the person who created it",
        );
  const status = account?.status ?? "none",
    trialAvailable = !account?.trial_used,
    start = `/api/billing/checkout?next=${encodeURIComponent("/app")}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-violet-50/40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/app" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-semibold tracking-tight">Metric Mage</span>
        </Link>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 hover:text-zinc-900">Sign out</button>
        </form>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-6 pb-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Billing</h1>
          <p className="mt-2 text-zinc-600">
            {describePrice(Math.max(owned, 1))}. Everyone you invite to your organisations is
            included for free.
          </p>
        </div>
        <Notice searchParams={await searchParams} />

        {paused ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <p className="font-semibold">{ctx.organisation.name} is paused</p>
            <p className="mt-1 text-sm">
              {mine
                ? "Its tools have stopped syncing until your subscription is active again. Nothing has been deleted."
                : `Its subscription isn't active. Ask ${owner} to renew it. Nothing has been deleted.`}
            </p>
          </div>
        ) : null}

        <article className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <CreditCard aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-zinc-950">Your plan</h2>
              <p className="text-sm text-zinc-500">
                {`You've created ${owned} organisation${owned === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>

          {!enabled ? (
            <p className="text-sm text-zinc-600">Billing isn&apos;t switched on yet.</p>
          ) : account?.comped ? (
            <p className="text-sm text-zinc-600">Your account has free access. Nothing to pay.</p>
          ) : status === "trialing" ? (
            <p className="text-sm text-zinc-600">
              {`Free trial until ${date(account!.trial_ends_at)}. `}
              {account!.cancel_at_period_end
                ? "You've cancelled, so you won't be charged."
                : "After that it's charged monthly to your card. Cancel any time before then and you won't pay anything."}
            </p>
          ) : status === "active" ? (
            <p className="text-sm text-zinc-600">
              {account!.cancel_at_period_end
                ? `Cancelled. You'll keep access until ${date(account!.current_period_end)}.`
                : `Next payment on ${date(account!.current_period_end)}.`}
            </p>
          ) : status === "past_due" ? (
            <p className="text-sm text-amber-800">
              Your last payment didn&apos;t go through. Update your card to keep your organisations
              running.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">
              {trialAvailable
                ? `Start a ${PLAN.trialDays}-day free trial. You'll add a card now, and it's only charged if you don't cancel before the trial ends.`
                : "Your subscription has ended. Restart it to bring your organisations back."}
            </p>
          )}

          {enabled && !account?.comped ? (
            <div className="flex flex-wrap gap-3">
              {hasAccess(account) || account?.stripe_customer_id ? (
                <Link className="button button-secondary" href="/api/billing/portal">
                  Manage billing
                </Link>
              ) : null}
              {!hasAccess(account) ? (
                <Link className="button" href={start}>
                  {trialAvailable
                    ? `Start ${PLAN.trialDays}-day free trial`
                    : "Restart subscription"}
                </Link>
              ) : null}
            </div>
          ) : null}
          {enabled && !account?.comped ? (
            <p className="text-xs text-zinc-500">
              Payments are handled by Stripe. Manage billing lets you change your card, download
              invoices or cancel.
            </p>
          ) : null}
        </article>

        {ctx.organisations.length > 1 ? (
          <article className="card">
            <h2 className="font-semibold text-zinc-950">Switch organisation</h2>
            <ul className="mt-3 divide-y divide-zinc-100">
              {ctx.organisations.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm text-zinc-800">
                    {o.name}
                    {o.id === ctx.organisation.id ? (
                      <span className="ml-2 text-zinc-400">(current)</span>
                    ) : null}
                  </span>
                  {o.id !== ctx.organisation.id ? (
                    <form action={switchOrganisation}>
                      <input type="hidden" name="organisationId" value={o.id} />
                      <button className="text-sm font-medium text-violet-700 hover:underline">
                        Open
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {!paused ? (
          <Link className="text-sm text-zinc-500 hover:text-zinc-900" href="/app">
            ← Back to Metric Mage
          </Link>
        ) : null}
      </section>
    </main>
  );
}
