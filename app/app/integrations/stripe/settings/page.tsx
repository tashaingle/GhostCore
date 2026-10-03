import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
export default async function StripeSettingsPage() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const {data: accounts} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_id,provider_account_name,status,last_sync_at,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "stripe")
    .order("created_at");
  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Integrations
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Stripe accounts
        </h1>
        <p className="text-zinc-600">
          Your connected Stripe accounts and whether they’re syncing. Metric Mage never shows your
          keys.
        </p>
      </div>
      {!accounts?.length ? (
        <div className="card">No Stripe accounts are connected.</div>
      ) : (
        accounts.map((account) => {
          const settings =
            account.settings &&
            typeof account.settings === "object" &&
            !Array.isArray(account.settings)
              ? (account.settings as Record<string, unknown>)
              : {};
          const test = settings.mode === "test";
          return (
            <article className="card space-y-3" key={account.id}>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">
                  {account.provider_account_name || "Stripe account"}
                </h3>
                <span
                  className={`rounded px-2 py-1 text-xs ${test ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}
                >
                  {test ? "TEST MODE" : "LIVE MODE"}
                </span>
                <span className="ml-auto text-sm">{account.status}</span>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Account ID</dt>
                  <dd>{account.provider_account_id}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Country / currency</dt>
                  <dd>
                    {String(settings.country ?? "None")} /{" "}
                    {String(settings.defaultCurrency ?? "None").toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Charges / payouts</dt>
                  <dd>
                    {settings.chargesEnabled ? "Enabled" : "Disabled"} /{" "}
                    {settings.payoutsEnabled ? "Enabled" : "Disabled"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Last webhook</dt>
                  <dd>
                    {settings.lastWebhookAt
                      ? new Date(String(settings.lastWebhookAt)).toLocaleString()
                      : "None received"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })
      )}
    </section>
  );
}
