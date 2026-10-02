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
          ← Connections
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Facebook Pages and Instagram
        </h1>
        <p className="text-zinc-600">
          Choose the Facebook Pages and linked Instagram business accounts to track. Ghost only
          reads followers, reach, views and engagement.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Facebook shares one set of permissions with Ghost across all your organisations. If you
          connect again, keep every business and Page ticked on Facebook&apos;s screens: anything
          you untick disappears from all of them. You choose what each organisation tracks here.
        </p>
      </div>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/meta-social/connect">
          Connect Facebook Pages
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
                <strong>
                  Connected through {item.provider_account_name}&apos;s Facebook login
                </strong>
                <p className="text-sm text-zinc-500">
                  {item.token_expires_at
                    ? `Reconnect before ${new Date(item.token_expires_at).toLocaleDateString("en-GB", {day: "numeric", month: "long"})} to keep syncing.`
                    : "This login doesn't expire."}{" "}
                  Missing a Page?{" "}
                  <Link className="underline" href="/api/integrations/meta-social/connect">
                    Connect again
                  </Link>{" "}
                  and tick it on Facebook.
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
                      {a.username ? ` · @${a.username}` : ""}
                      {a.followers != null ? ` · ${a.followers} followers` : ""}
                      {a.accessState === "disabled" ? " · Ghost can't read this one" : ""}
                    </span>
                  </span>
                </label>
              ))}
              {!assets.length ? (
                <p className="text-sm text-zinc-600">
                  No Pages found. Check this Facebook account manages a Page, and that any Instagram
                  account is a business account linked to it.
                </p>
              ) : null}
              <div className="flex gap-3">
                <button className="button">Save</button>
                <Link className="button button-secondary" href="/app/integrations">
                  Back to Connections
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
