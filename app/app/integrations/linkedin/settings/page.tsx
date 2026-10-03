import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveLinkedInAssets} from "@/app/linkedin-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export default async function LinkedInSettings({
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
    .eq("provider", "linkedin")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="LinkedIn ad accounts and Pages"
        description={`Choose the ad accounts and Company Pages ${ctx.organisation.name} tracks. Metric Mage only reads them.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect LinkedIn to choose ad accounts and Company Pages.</p>
          <Link className="button" href="/api/integrations/linkedin/connect">
            Connect LinkedIn
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const s = item.settings as Record<string, unknown>,
            ads = Array.isArray(s.adAccounts)
              ? (s.adAccounts as {
                  id: string;
                  name: string;
                  status?: string;
                  currency?: string;
                  selected?: boolean;
                }[])
              : [],
            orgs = Array.isArray(s.organisations)
              ? (s.organisations as {
                  id: string;
                  name: string;
                  vanityName?: string;
                  selected?: boolean;
                }[])
              : [];
          return (
            <form action={saveLinkedInAssets} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "LinkedIn account"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              <h3 className="font-semibold">Ad accounts</h3>
              {!ads.length && (
                <div className="card">
                  Metric Mage can&apos;t see any ad accounts on this login yet. Add the account in
                  LinkedIn, then connect again.
                </div>
              )}
              {ads.map((a) => (
                <label className="card flex items-center gap-3" key={a.id}>
                  <input
                    type="checkbox"
                    name="adAccount"
                    value={a.id}
                    defaultChecked={a.selected}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {[a.status, a.currency].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <h3 className="font-semibold">Company Pages</h3>
              {!orgs.length && (
                <div className="card">
                  Metric Mage can&apos;t see any Company Pages on this login yet. You need admin
                  access to the Page, then connect again.
                </div>
              )}
              {orgs.map((o) => (
                <label className="card flex items-center gap-3" key={o.id}>
                  <input
                    type="checkbox"
                    name="organisation"
                    value={o.id}
                    defaultChecked={o.selected}
                  />
                  <span>
                    <strong>{o.name}</strong>
                    {o.vanityName ? (
                      <span className="block text-sm text-zinc-500">{o.vanityName}</span>
                    ) : null}
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {ads.length + orgs.length > 0 && (
                  <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                )}
                <Link className="button button-secondary" href="/api/integrations/linkedin/connect">
                  Account missing? Connect LinkedIn again
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
