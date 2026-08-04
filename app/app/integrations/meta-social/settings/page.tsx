import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveMetaSocialAssets} from "@/app/meta-social-actions";

export default async function MetaSocialSettings() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select(
      "id,provider_account_name,status,last_sync_at,last_sync_status,last_sync_error,token_expires_at,settings",
    )
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "meta_social")
    .order("created_at");

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Integrations
        </Link>
        <h2 className="mt-2 text-2xl font-bold">Meta Social assets</h2>
        <p className="text-zinc-600">
          Select Facebook Pages and linked Instagram professional accounts. Ghost only reads organic
          insights (followers, reach, views, engagement).
        </p>
      </div>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/meta-social/connect">
          Connect Meta Social
        </Link>
      ) : (
        items.map((item) => {
          const s = item.settings as Record<string, unknown>;
          const assets = Array.isArray(s.assets)
            ? (s.assets as {
                id: string;
                kind: string;
                name: string;
                username?: string;
                followers?: number | null;
                selected?: boolean;
                accessState?: string;
              }[])
            : [];
          return (
            <form action={saveMetaSocialAssets} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <div className="card">
                <strong>{item.provider_account_name}</strong>
                <p className="text-sm text-zinc-500">
                  Graph {String(s.graphApiVersion ?? "")} · Permissions:{" "}
                  {((s.grantedPermissions as string[]) ?? []).join(", ") || "None"} · Expires:{" "}
                  {item.token_expires_at
                    ? new Date(item.token_expires_at).toLocaleString()
                    : "Unknown"}
                </p>
                {item.last_sync_error ? (
                  <p className="text-red-700">{item.last_sync_error}</p>
                ) : null}
              </div>
              {assets.map((a) => (
                <label className="card flex gap-3" key={a.id}>
                  <input
                    type="checkbox"
                    name="asset"
                    value={a.id}
                    defaultChecked={a.selected}
                    disabled={a.accessState === "disabled"}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {a.kind === "instagram_account" ? "Instagram" : "Facebook Page"}
                      {a.username ? ` · @${a.username}` : ""} · id {a.id}
                      {a.followers != null ? ` · ${a.followers} followers` : ""}
                      {a.accessState === "disabled" ? " · limited access" : ""}
                    </span>
                  </span>
                </label>
              ))}
              {!assets.length ? (
                <p className="text-sm text-zinc-600">
                  No Pages were discovered. Ensure this Meta user manages a Page and that Instagram is
                  linked as a professional account.
                </p>
              ) : null}
              <div className="flex gap-3">
                <button className="button">Save assets</button>
                <Link className="button button-secondary" href="/app/integrations">
                  Back to integrations
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
