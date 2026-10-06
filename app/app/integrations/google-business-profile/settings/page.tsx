import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveBusinessProfileLocations} from "@/app/google-business-profile-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

const CONNECT = "/api/integrations/google-business-profile/connect";

export default async function BusinessProfileSettings({
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
    .eq("provider", "google_business_profile")
    .order("created_at");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Business Profile locations"
        description={`Choose the places ${ctx.organisation.name} tracks. Metric Mage reads new Google reviews and how many people viewed, called, visited the website or asked for directions.`}
      />
      <Notice searchParams={params} />
      {!items?.length ? (
        <div className="card space-y-3">
          <p>Connect Google Business Profile to choose locations.</p>
          <Link className="button" href={CONNECT}>
            Connect Google Business Profile
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const settings = item.settings as Record<string, unknown>,
            locations = Array.isArray(settings.locations)
              ? (settings.locations as {
                  location: string;
                  title: string;
                  address?: string;
                  selected?: boolean;
                }[])
              : [];
          return (
            <form action={saveBusinessProfileLocations} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <h2 className="text-lg font-semibold text-zinc-950">
                {item.provider_account_name || "Google account"}
              </h2>
              {item.last_sync_error && <p className="error">{item.last_sync_error}</p>}
              {!locations.length && (
                <div className="card">
                  Metric Mage can&apos;t see any businesses on this Google account. Sign in with an
                  account that owns or manages the Business Profile, then connect again.
                </div>
              )}
              {locations.map((place) => (
                <label className="card flex items-center gap-3" key={place.location}>
                  <input
                    type="checkbox"
                    name="location"
                    value={place.location}
                    defaultChecked={place.selected}
                  />
                  <span>
                    <strong>{place.title}</strong>
                    {place.address && (
                      <span className="block text-sm text-zinc-500">{place.address}</span>
                    )}
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                {locations.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
                <Link className="button button-secondary" href={CONNECT}>
                  Business missing? Connect again
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
