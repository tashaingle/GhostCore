import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveAppStoreApps} from "@/app/app-store-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

const CONNECT = "/app/integrations/app-store/connect";

export default async function AppStoreSettings({
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
    .eq("provider", "app_store")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="App Store apps"
        description={`Choose the apps ${ctx.organisation.name} tracks. Metric Mage reads new App Store reviews.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect the App Store to choose apps.</p>
          <Link className="button" href={CONNECT}>
            Connect App Store
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const settings = item.settings as Record<string, unknown>,
            apps = Array.isArray(settings.apps)
              ? (settings.apps as {
                  appId: string;
                  name: string;
                  bundleId: string;
                  selected?: boolean;
                }[])
              : [];
          return (
            <form action={saveAppStoreApps} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "App Store Connect"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              {!apps.length && (
                <div className="card">
                  This key can&apos;t see any apps yet. Check the key&apos;s role in App Store
                  Connect, then connect again.
                </div>
              )}
              {apps.map((app) => (
                <label className="card flex items-center gap-3" key={app.appId}>
                  <input
                    type="checkbox"
                    name="app"
                    value={app.appId}
                    defaultChecked={app.selected}
                  />
                  <span>
                    <strong>{app.name}</strong>
                    <span className="block text-sm text-zinc-500">{app.bundleId || app.appId}</span>
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {apps.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
                <Link className="button button-secondary" href={CONNECT}>
                  App missing? Connect the App Store again
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
