import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {saveNotionDataSources} from "@/app/notion-actions";
export default async function NotionSettings() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select(
      "id,provider_account_name,status,last_sync_at,last_sync_status,last_sync_error,token_expires_at,settings",
    )
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "notion")
    .order("created_at");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Integrations
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Notion databases
        </h1>
        <p className="text-zinc-600">
          Choose which shared databases to track. Ghost reads database fields only, never the text
          inside your pages.
        </p>
      </div>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/notion/connect">
          Connect Notion
        </Link>
      ) : (
        items.map((item) => {
          const s = item.settings as Record<string, unknown>,
            sources = Array.isArray(s.dataSources)
              ? (s.dataSources as {
                  id: string;
                  databaseId?: string;
                  title: string;
                  lastEditedTime: string;
                  icon?: string;
                  inTrash: boolean;
                  selected?: boolean;
                  latestError?: string;
                }[])
              : [];
          return (
            <form action={saveNotionDataSources} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <div className="card">
                <strong>{item.provider_account_name}</strong>
                <p className="text-sm text-zinc-500">
                  Workspace {String(s.workspaceId)} · API {String(s.apiVersion)} · Last sync{" "}
                  {item.last_sync_at ? new Date(item.last_sync_at).toLocaleString() : "never"} ·{" "}
                  {item.last_sync_status}
                </p>
                <p className="text-sm text-zinc-500">
                  Rows {String(s.rowsImported ?? 0)} · events {String(s.eventsGenerated ?? 0)} ·
                  duplicates {String(s.duplicatesSkipped ?? 0)}
                </p>
                {item.last_sync_error && <p className="text-red-700">{item.last_sync_error}</p>}
              </div>
              {!sources.length && (
                <div className="card">
                  No databases found. In Notion, share a database with Ghost Core, then reconnect.
                </div>
              )}
              {sources.map((d) => (
                <label className="card flex gap-3" key={d.id}>
                  <input
                    type="checkbox"
                    name="dataSource"
                    value={d.id}
                    defaultChecked={d.selected}
                    disabled={d.inTrash}
                  />
                  <span>
                    <strong>
                      {d.icon} {d.title}
                    </strong>
                    <span className="block text-sm text-zinc-500">
                      {d.id} · parent {d.databaseId ?? "unknown"} · edited{" "}
                      {new Date(d.lastEditedTime).toLocaleString()} {d.inTrash ? "· in trash" : ""}
                    </span>
                  </span>
                </label>
              ))}
              <div className="flex gap-2">
                <button className="button">Save databases</button>
                <Link className="button button-secondary" href="/app/integrations/notion">
                  Dashboard
                </Link>
                <Link className="button button-secondary" href="/api/integrations/notion/connect">
                  Connect another workspace
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
