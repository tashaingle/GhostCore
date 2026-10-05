import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveSearchConsoleProperties} from "@/app/google-search-console-actions";
export default async function SearchConsoleProperties() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: integrations} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,settings,status,last_sync_error")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "google_search_console")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Search Console properties
        </h1>
        <p className="text-zinc-600">Choose up to ten websites to track in Google Search.</p>
      </div>
      {!integrations?.length ? (
        <div className="card">
          <p>Connect Search Console before selecting properties.</p>
          <Link className="button mt-3" href="/api/integrations/google-search-console/connect">
            Connect Search Console
          </Link>
        </div>
      ) : (
        integrations.map((integration) => {
          const settings =
              integration.settings &&
              typeof integration.settings === "object" &&
              !Array.isArray(integration.settings)
                ? (integration.settings as Record<string, unknown>)
                : {},
            properties = Array.isArray(settings.properties)
              ? (settings.properties as {
                  siteUrl: string;
                  permissionLevel: string;
                  type: string;
                  selected?: boolean;
                }[])
              : [];
          return (
            <form action={saveSearchConsoleProperties} className="space-y-3" key={integration.id}>
              <input type="hidden" name="integrationId" value={integration.id} />
              <h3 className="font-semibold">Connected as {integration.provider_account_name}</h3>
              {integration.last_sync_error ? (
                <p className="error">{integration.last_sync_error}</p>
              ) : null}
              {!properties.length ? (
                <div className="card">
                  Metric Mage can&apos;t see any Search Console sites on this login yet. Add the
                  site in Search Console with this Google account, then connect again.
                </div>
              ) : null}
              {properties.map((property) => (
                <label className="card flex gap-3" key={property.siteUrl}>
                  <input
                    type="checkbox"
                    name="property"
                    value={property.siteUrl}
                    defaultChecked={property.selected}
                  />
                  <span>
                    <strong>{property.siteUrl}</strong>
                    <span className="block text-sm text-zinc-500">
                      {property.type.replace("_", " ")} · {property.permissionLevel}
                    </span>
                  </span>
                </label>
              ))}
              <div className="card grid gap-3 sm:grid-cols-2">
                <label>
                  Tell me when clicks change by at least (%)
                  <input
                    className="input mt-1"
                    type="number"
                    min="5"
                    max="100"
                    name="thresholdPercent"
                    defaultValue={Number(settings.thresholdPercent ?? 25)}
                  />
                  <span className="mt-1 block text-sm text-zinc-500">
                    Compared with the previous period. 25% suits most sites.
                  </span>
                </label>
                <label>
                  Ignore pages and searches with fewer clicks than
                  <input
                    className="input mt-1"
                    type="number"
                    min="1"
                    max="1000"
                    name="minimumClicks"
                    defaultValue={Number(settings.minimumClicks ?? 10)}
                  />
                  <span className="mt-1 block text-sm text-zinc-500">
                    Stops tiny numbers looking dramatic, like 2 clicks falling to 1.
                  </span>
                </label>
              </div>
              <button className="button">Save</button>
            </form>
          );
        })
      )}
    </section>
  );
}
