import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveLinkedInAssets} from "@/app/linkedin-actions";
export default async function LinkedInSettings() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,last_sync_error,token_expires_at,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "linkedin")
    .order("created_at");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Integrations
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          LinkedIn ad accounts and Pages
        </h1>
        <p className="text-zinc-600">
          Choose the ad accounts and Company Pages to track. What appears here depends on LinkedIn
          approving Metric Mage and on your role in each account or Page.
        </p>
      </div>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/linkedin/connect">
          Connect LinkedIn
        </Link>
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
                  accessState?: string;
                }[])
              : [],
            orgs = Array.isArray(s.organisations)
              ? (s.organisations as {
                  id: string;
                  name: string;
                  vanityName?: string;
                  selected?: boolean;
                  accessState?: string;
                }[])
              : [],
            cap = s.capabilities as Record<string, unknown> | undefined;
          return (
            <form action={saveLinkedInAssets} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <div className="card">
                <strong>{item.provider_account_name}</strong>
                <p className="text-sm text-zinc-500">
                  API {String(s.apiVersion)} · Scopes:{" "}
                  {((s.grantedScopes as string[]) ?? []).join(", ") || "None"} · Expires:{" "}
                  {item.token_expires_at
                    ? new Date(item.token_expires_at).toLocaleString()
                    : "Unknown"}
                </p>
                <pre className="mt-2 overflow-auto text-xs text-zinc-500">
                  {JSON.stringify(cap, null, 2)}
                </pre>
                {item.last_sync_error && <p className="text-red-700">{item.last_sync_error}</p>}
              </div>
              <h3 className="font-semibold">Advertising accounts</h3>
              {!ads.length && (
                <div className="card text-zinc-500">
                  No ad accounts found. LinkedIn may still be reviewing Metric Mage’s access, or
                  your LinkedIn account may not have access to an ad account.
                </div>
              )}
              {ads.map((a) => (
                <label className="card flex gap-3" key={a.id}>
                  <input
                    type="checkbox"
                    name="adAccount"
                    value={a.id}
                    defaultChecked={a.selected}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {a.id} · {a.status || "Unknown status"} ·{" "}
                      {a.currency || "Currency not reported"}
                    </span>
                  </span>
                </label>
              ))}
              <h3 className="font-semibold">Company Pages</h3>
              {!orgs.length && (
                <div className="card text-zinc-500">
                  No Company Pages found. LinkedIn may still be reviewing Metric Mage’s access, or
                  you may not be an admin of a Company Page.
                </div>
              )}
              {orgs.map((o) => (
                <label className="card flex gap-3" key={o.id}>
                  <input
                    type="checkbox"
                    name="organisation"
                    value={o.id}
                    defaultChecked={o.selected}
                  />
                  <span>
                    <strong>{o.name}</strong>
                    <span className="block text-sm text-zinc-500">{o.vanityName || o.id}</span>
                  </span>
                </label>
              ))}
              <button className="button">Save assets</button>
            </form>
          );
        })
      )}
    </section>
  );
}
