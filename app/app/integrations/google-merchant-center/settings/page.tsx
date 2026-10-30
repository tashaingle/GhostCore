import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveMerchantCenterAccounts} from "@/app/google-merchant-center-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

const CONNECT = "/api/integrations/google-merchant-center/connect";

export default async function MerchantCenterSettings({
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
    .eq("provider", "google_merchant_center")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Merchant Center accounts"
        description={`Choose the Merchant Center account ${ctx.organisation.name} sells through. Metric Mage reads product approvals, problems Google has found, and Shopping clicks. It never changes your products.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect Google Merchant Center to choose an account.</p>
          <Link className="button" href={CONNECT}>
            Connect Merchant Center
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const settings = item.settings as Record<string, unknown>,
            accounts = Array.isArray(settings.accounts)
              ? (settings.accounts as {accountId: string; name: string; selected?: boolean}[])
              : [];
          return (
            <form action={saveMerchantCenterAccounts} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "Google account"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              {!accounts.length && (
                <div className="card">
                  Metric Mage can&apos;t see any Merchant Center accounts on this Google login. Sign
                  in with an account that has access to your Merchant Center, then connect again.
                </div>
              )}
              {accounts.map((account) => (
                <label className="card flex items-center gap-3" key={account.accountId}>
                  <input
                    type="checkbox"
                    name="account"
                    value={account.accountId}
                    defaultChecked={account.selected}
                  />
                  <span>
                    <strong>{account.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      Merchant ID {account.accountId}
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
