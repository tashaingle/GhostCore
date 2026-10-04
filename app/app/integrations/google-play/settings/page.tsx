import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveGooglePlayApps} from "@/app/google-play-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export default async function GooglePlaySettings({
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
    .eq("provider", "google_play")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Google Play apps"
        description={`Choose the apps ${ctx.organisation.name} tracks. Metric Mage reads new reviews and the daily crash rate.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect Google Play to choose apps.</p>
          <Link className="button" href="/api/integrations/google-play/connect">
            Connect Google Play
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const settings = item.settings as Record<string, unknown>,
            apps = Array.isArray(settings.apps)
              ? (settings.apps as {packageName: string; displayName: string; selected?: boolean}[])
              : [];
          return (
            <form action={saveGooglePlayApps} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "Google account"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              {!apps.length && (
                <div className="card">
                  Metric Mage can&apos;t see any Play apps on this login yet. Open the app in Play
                  Console with this Google account, then connect again.
                </div>
              )}
              {apps.map((app) => (
                <label className="card flex items-center gap-3" key={app.packageName}>
                  <input
                    type="checkbox"
                    name="app"
                    value={app.packageName}
                    defaultChecked={app.selected}
                  />
                  <span>
                    <strong>{app.displayName}</strong>
                    <span className="block text-sm text-zinc-500">{app.packageName}</span>
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {apps.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
                <Link
                  className="button button-secondary"
                  href="/api/integrations/google-play/connect"
                >
                  App missing? Connect Google Play again
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
