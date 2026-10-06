import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveGoogleAdsAccounts} from "@/app/google-ads-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

const CONNECT = "/api/integrations/google-ads/connect";
const dashed = (id: string) => `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;

export default async function GoogleAdsSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,last_sync_error,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "google_ads")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Google Ads accounts"
        description={`Choose the ad accounts ${ctx.organisation.name} tracks. Metric Mage reads daily spend, clicks and conversions. It never changes your ads.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect Google Ads to choose accounts.</p>
          <Link className="button" href={CONNECT}>
            Connect Google Ads
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const settings = item.settings as Record<string, unknown>,
            accounts = Array.isArray(settings.accounts)
              ? (settings.accounts as {
                  customerId: string;
                  name: string;
                  currency: string;
                  selected?: boolean;
                }[])
              : [];
          return (
            <form action={saveGoogleAdsAccounts} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "Google account"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              {!accounts.length && (
                <div className="card">
                  Metric Mage can&apos;t see any ad accounts on this Google login. Sign in with an
                  account that has access to your Google Ads, then connect again.
                </div>
              )}
              {accounts.map((account) => (
                <label className="card flex items-center gap-3" key={account.customerId}>
                  <input
                    type="checkbox"
                    name="account"
                    value={account.customerId}
                    defaultChecked={account.selected}
                  />
                  <span>
                    <strong>{account.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {dashed(account.customerId)} · {account.currency}
                    </span>
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {accounts.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
                <Link className="button button-secondary" href={CONNECT}>
                  Account missing? Connect again
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
