import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveAppStoreApps, saveAppStoreDownloads} from "@/app/app-store-actions";
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
        description={`Choose the apps ${ctx.organisation.name} tracks. Metric Mage reads new App Store reviews, and daily downloads once they are turned on below.`}
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
      {items?.map((item) => {
        const settings = item.settings as Record<string, unknown>,
          vendorNumber = typeof settings.vendorNumber === "string" ? settings.vendorNumber : "",
          reportsKeyId = typeof settings.reportsKeyId === "string" ? settings.reportsKeyId : "",
          problem = typeof settings.downloadsError === "string" ? settings.downloadsError : "";
        return (
          <form
            action={saveAppStoreDownloads}
            className="card space-y-4"
            key={`downloads-${item.id}`}
          >
            <input type="hidden" name="integrationId" value={item.id} />
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Downloads</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Daily downloads for the apps above, from Apple&apos;s sales reports. Apple only
                shares these with keys that have the Sales (with access to reports), Finance or
                Admin role. If the key above is App Manager, add a second key here.
              </p>
            </div>
            {problem && <p className="error">{problem}</p>}
            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-950">Vendor number</span>
              <input
                className="field w-full font-mono"
                name="vendorNumber"
                defaultValue={vendorNumber}
                inputMode="numeric"
                placeholder="From Payments and Financial Reports"
              />
              <span className="block text-xs text-zinc-500">
                Leave empty to turn downloads off.
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-950">
                Reports key ID <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <input
                className="field w-full font-mono"
                name="reportsKeyId"
                placeholder={
                  reportsKeyId ? `Using ${reportsKeyId}` : "A key with the Sales or Finance role"
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-950">
                Reports key private key{" "}
                <span className="font-normal text-zinc-500">(.p8 file contents, optional)</span>
              </span>
              <textarea
                className="field w-full font-mono text-xs"
                name="reportsPrivateKey"
                rows={5}
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
              <span className="block text-xs text-zinc-500">
                It must belong to the same App Store Connect team as the key above.
              </span>
            </label>
            <SubmitButton pendingLabel="Checking with Apple…">Save downloads</SubmitButton>
          </form>
        );
      })}
    </section>
  );
}
