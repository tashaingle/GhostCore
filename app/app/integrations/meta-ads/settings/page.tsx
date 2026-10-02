import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveMetaAccounts} from "@/app/meta-ads-actions";
export default async function MetaAdsSettings() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select(
      "id,provider_account_name,status,last_sync_at,last_sync_status,last_sync_error,token_expires_at,settings",
    )
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "meta_ads")
    .order("created_at");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Connections
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Meta Ads accounts
        </h1>
        <p className="text-zinc-600">
          Choose up to ten ad accounts to track. This includes your own ad accounts and those owned
          by businesses you gave Ghost access to. Ghost can only read results, never change ads.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Facebook shares one set of permissions with Ghost across all your organisations. If you
          connect again, keep every business and Page ticked on Facebook&apos;s screens: anything
          you untick disappears from all of them. You choose what each organisation tracks here.
        </p>
      </div>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/meta-ads/connect">
          Connect Meta Ads
        </Link>
      ) : (
        items.map((item) => {
          const s = item.settings as Record<string, unknown>,
            accounts = Array.isArray(s.accounts)
              ? (s.accounts as {
                  id: string;
                  accountId: string;
                  name: string;
                  currency: string;
                  timezoneName: string;
                  accountStatus: number;
                  businessName?: string;
                  selected?: boolean;
                  accessState?: string;
                }[])
              : [];
          return (
            <form action={saveMetaAccounts} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <div className="card">
                <strong>
                  Connected through {item.provider_account_name}&apos;s Facebook login
                </strong>
                <p className="text-sm text-zinc-500">
                  {item.token_expires_at
                    ? `Reconnect before ${new Date(item.token_expires_at).toLocaleDateString("en-GB", {day: "numeric", month: "long"})} to keep syncing.`
                    : "This login doesn't expire."}{" "}
                  Missing a business&apos;s ad account?{" "}
                  <Link className="underline" href="/api/integrations/meta-ads/connect">
                    Reconnect
                  </Link>{" "}
                  and tick that business when Facebook asks which ones Ghost can see.
                </p>
                {item.last_sync_error && <p className="text-red-700">{item.last_sync_error}</p>}
              </div>
              {accounts.map((a) => (
                <label className="card flex gap-3" key={a.accountId}>
                  <input
                    type="checkbox"
                    name="account"
                    value={a.accountId}
                    defaultChecked={a.selected}
                    disabled={a.accessState === "disabled"}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {a.businessName ? `Owned by ${a.businessName}` : "Personal ad account"} ·{" "}
                      {a.currency} · ID {a.accountId}
                      {a.accessState === "disabled" ? " · Disabled in Meta" : ""}
                    </span>
                  </span>
                </label>
              ))}
              <div className="flex gap-3">
                <button className="button">Save</button>
                <Link className="button button-secondary" href="/app/integrations/meta-ads">
                  Open reporting
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
