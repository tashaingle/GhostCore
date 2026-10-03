import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {refreshSlackChannels, saveSlackChannels} from "@/app/slack-actions";
import {Notice} from "@/components/notice";
export default async function SlackSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const params = await searchParams,
    q = String(params.q ?? "").toLowerCase(),
    {data: items} = await ctx.supabase
      .from("integrations")
      .select(
        "id,provider_account_name,last_sync_at,last_sync_status,last_sync_error,token_expires_at,settings",
      )
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "slack")
      .order("created_at");
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Integrations
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Slack channels</h1>
        <p className="text-zinc-600">
          Select channels explicitly. Metric Mage never joins channels, imports DMs or sends
          messages.
        </p>
      </div>
      <Notice searchParams={params} />
      <form>
        <input className="input" name="q" defaultValue={q} placeholder="Search channels" />
        <button className="button button-secondary ml-2">Search</button>
      </form>
      {!items?.length ? (
        <Link className="button" href="/api/integrations/slack/connect">
          Connect Slack
        </Link>
      ) : (
        items.map((item) => {
          const s = item.settings as Record<string, unknown>,
            channels = (
              Array.isArray(s.channels)
                ? (s.channels as {
                    id: string;
                    name: string;
                    topic: string;
                    isPrivate: boolean;
                    isArchived: boolean;
                    isMember: boolean;
                    isExtShared: boolean;
                    selected?: boolean;
                    accessState: string;
                    historyCapability: string;
                    checkpoint?: string;
                    cursor?: string;
                    latestError?: string;
                  }[])
                : []
            ).filter((c) => !q || c.name.toLowerCase().includes(q));
          return (
            <form action={saveSlackChannels} className="space-y-3" key={item.id}>
              <input type="hidden" name="integrationId" value={item.id} />
              <div className="card">
                <strong>{item.provider_account_name}</strong>
                <p className="text-sm text-zinc-500">
                  Team {String(s.teamId)} · scopes{" "}
                  {((s.grantedBotScopes as string[]) ?? []).join(", ")} ·{" "}
                  {String(s.syncState ?? "Not synced")}
                </p>
                <p className="text-sm text-zinc-500">
                  Next continuation{" "}
                  {s.nextEligibleSyncAt
                    ? new Date(String(s.nextEligibleSyncAt)).toLocaleString()
                    : "ready"}{" "}
                  · messages {String(s.messagesImported ?? 0)} · events{" "}
                  {String(s.eventsGenerated ?? 0)} · duplicates {String(s.duplicatesSkipped ?? 0)}
                </p>
                {item.last_sync_error && <p className="text-red-700">{item.last_sync_error}</p>}
              </div>
              {channels.some((c) => !c.isMember && !c.isArchived) ? (
                <p className="info-banner">
                  To let Metric Mage read a channel, open it in Slack and type{" "}
                  <code>/invite @</code> followed by your app&apos;s name. Then click{" "}
                  <strong>Refresh channels</strong>.
                </p>
              ) : null}
              {channels.map((c) => (
                <label className="card flex gap-3" key={c.id}>
                  <input
                    type="checkbox"
                    name="channel"
                    value={c.id}
                    defaultChecked={c.selected}
                    disabled={c.historyCapability !== "available"}
                  />
                  <span>
                    <strong>#{c.name}</strong>
                    <span className="block text-sm text-zinc-500">
                      {c.isPrivate ? "Private" : "Public"} · {c.accessState} ·{" "}
                      {c.isExtShared ? "Slack Connect · " : ""}
                      {c.checkpoint ? "syncing" : "not synced yet"}
                    </span>
                    <span className="block max-w-xl truncate text-xs">{c.topic}</span>
                    {c.latestError && <span className="text-sm text-red-700">{c.latestError}</span>}
                  </span>
                </label>
              ))}
              <div className="flex gap-2">
                <button className="button">Save channels</button>
                <button className="button button-secondary" formAction={refreshSlackChannels}>
                  Refresh channels
                </button>
                <Link className="button button-secondary" href="/app/integrations/slack">
                  Dashboard
                </Link>
                <Link className="button button-secondary" href="/api/integrations/slack/connect">
                  Reconnect
                </Link>
              </div>
            </form>
          );
        })
      )}
    </section>
  );
}
