import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {
  getProvider,
  hasCapability,
  providers,
  type ProviderDefinition,
} from "@/lib/integrations/registry";
import {connectionStatus, reconnectHref, type ConnectionState} from "@/lib/home/connections";
import {ProviderMark} from "@/components/home-ui";
import {githubAppEnv, manageUrl} from "@/lib/integrations/github/app";
import {disconnectIntegration, syncIntegration} from "@/app/integration-actions";
import {ConnectProviderButton} from "@/components/connect-provider-button";
import {Notice} from "@/components/notice";
import {configureIntegrationLabel} from "@/lib/ui/labels";
import type {Json} from "@/types/database";

const stateStyles: Record<ConnectionState, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  syncing: "bg-sky-50 text-sky-700",
  setup: "bg-amber-50 text-amber-800",
  stale: "bg-amber-50 text-amber-800",
  failing: "bg-rose-50 text-rose-700",
  expired: "bg-rose-50 text-rose-700",
};

type Integration = {
  id: string;
  provider: string;
  provider_account_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  settings: Json;
};

function Controls({
  provider,
  integration,
  siteUrl,
}: {
  provider: ProviderDefinition;
  integration?: Integration;
  siteUrl: string;
}) {
  const connected = integration && !["disconnected", "expired"].includes(integration.status);
  const settings = (integration?.settings ?? {}) as Record<string, unknown>;
  const configurationRequired = settings.configurationStatus === "property_required";

  if (hasCapability(provider, "manual")) {
    return integration ? (
      <Link className="button" href="/app/integrations/manual">
        Open Manual import
      </Link>
    ) : (
      <Link className="button" href="/api/integrations/manual/connect">
        Enable Manual
      </Link>
    );
  }

  if (provider.connector === null) {
    return (
      <button className="button button-secondary" disabled>
        Coming soon
      </button>
    );
  }

  if (!connected) {
    if (provider.connectPath) {
      return integration ? (
        <Link className="button" href={reconnectHref(provider, settings)}>
          Reconnect
        </Link>
      ) : (
        <Link className="button" href={provider.connectPath}>
          Connect {provider.displayName}
        </Link>
      );
    }
    if (provider.oauthProvider && provider.callbackPath) {
      return (
        <ConnectProviderButton
          providerId={provider.id}
          displayName={provider.displayName}
          oauthProvider={provider.oauthProvider}
          oauthScopes={provider.oauthScopes ?? ""}
          callbackPath={provider.callbackPath}
          configuredSiteUrl={siteUrl}
        />
      );
    }
    return null;
  }

  return (
    <>
      {provider.configurationPath ? (
        <Link className="button button-secondary" href={provider.configurationPath}>
          {configureIntegrationLabel(provider.id, configurationRequired)}
        </Link>
      ) : null}
      {provider.id === "github" && provider.connectPath ? (
        typeof settings.installationId === "string" ? (
          <a
            className="button button-secondary"
            href={manageUrl(
              settings.accountType as string | undefined,
              settings.accountLogin as string | undefined,
              settings.installationId,
            )}
            target="_blank"
            rel="noreferrer"
          >
            Manage repositories
          </a>
        ) : (
          // Older OAuth connections see every repository; upgrading lets the user pick.
          <Link className="button button-secondary" href={provider.connectPath}>
            Choose repositories
          </Link>
        )
      ) : provider.connectPath ? (
        <Link className="button button-secondary" href={provider.connectPath}>
          Reconnect
        </Link>
      ) : null}
      <form action={syncIntegration}>
        <input type="hidden" name="integrationId" value={integration.id} />
        <button
          className="button"
          disabled={integration.status === "syncing" || configurationRequired}
          title={configurationRequired ? "Finish setup before syncing" : "Import latest activity"}
        >
          {integration.status === "syncing"
            ? "Syncing…"
            : configurationRequired
              ? "Setup required"
              : "Sync now"}
        </button>
      </form>
      <form action={disconnectIntegration}>
        <input type="hidden" name="integrationId" value={integration.id} />
        <button className="button button-secondary">Disconnect</button>
      </form>
    </>
  );
}

export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const params = await searchParams;

  const [{data: integrations}, {data: logs}] = await Promise.all([
    ctx.supabase
      .from("integrations")
      .select(
        "id,provider,provider_account_name,status,last_sync_at,last_sync_status,last_sync_error,settings",
      )
      .eq("organisation_id", ctx.organisation.id)
      .order("created_at", {ascending: false}),
    ctx.supabase
      .from("integration_logs")
      .select(
        "id,provider,status,started_at,duration_ms,records_received,events_imported,events_skipped,error_count,rate_limited,error_message",
      )
      .eq("organisation_id", ctx.organisation.id)
      .order("started_at", {ascending: false})
      .limit(20),
  ]);

  const now = new Date();
  const githubAppReady = githubAppEnv() !== null;
  const byProvider = new Map(
    integrations?.map((integration) => [integration.provider, integration]),
  );
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const statuses = new Map(
    (integrations ?? [])
      .filter((i) => i.status !== "disconnected")
      .map((i) => [i.provider, connectionStatus(i, getProvider(i.provider), now)]),
  );
  const yours = providers
      .filter((p) => statuses.has(p.id))
      .sort(
        (a, b) =>
          Number(statuses.get(b.id)!.needsAttention) - Number(statuses.get(a.id)!.needsAttention) ||
          a.displayName.localeCompare(b.displayName),
      ),
    available = providers.filter((p) => !statuses.has(p.id)),
    attentionCount = [...statuses.values()].filter((s) => s.needsAttention).length;

  const card = (provider: ProviderDefinition) => {
    const integration = byProvider.get(provider.id),
      status = statuses.get(provider.id);
    return (
      <article
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03]"
        key={provider.id}
      >
        <div className="flex items-start gap-3">
          <ProviderMark provider={provider.id} />
          <div className="min-w-0">
            <h3 className="font-semibold text-zinc-950">{provider.displayName}</h3>
            <p className="text-xs text-zinc-500">
              {provider.category} · Updates {provider.recommendedFrequency.toLowerCase()}
            </p>
          </div>
          {status ? (
            <span
              className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${stateStyles[status.state]}`}
            >
              {status.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-zinc-600">{provider.description}</p>
        {integration && status ? (
          <div className="rounded-xl bg-zinc-50 px-3.5 py-2.5 text-sm">
            <p className="truncate font-medium text-zinc-800">
              {integration.provider_account_name || "Connected account"}
            </p>
            <p className="mt-0.5 text-zinc-500">{status.detail}</p>
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2">
          <Controls
            provider={
              // With the GitHub App configured, GitHub connects like other tools via its own route.
              provider.id === "github" && githubAppReady
                ? {...provider, connectPath: "/api/integrations/github/connect"}
                : provider
            }
            integration={integration}
            siteUrl={siteUrl}
          />
        </div>
      </article>
    );
  };

  return (
    <section className="mx-auto max-w-6xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Connections</h1>
        <p className="mt-2 max-w-2xl text-base text-zinc-500">
          The tools Ghost watches for you. Ghost only ever asks for read access, so it can never
          change anything in them.
        </p>
      </header>
      <Notice searchParams={params} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Working", statuses.size - attentionCount, "text-emerald-700"],
          ["Need attention", attentionCount, attentionCount ? "text-amber-700" : "text-zinc-950"],
          ["Available to add", available.length, "text-zinc-950"],
        ].map(([label, n, tone]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03]"
          >
            <p className="text-sm font-medium text-zinc-600">{label}</p>
            <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{n}</p>
          </article>
        ))}
      </div>

      {yours.length ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Your connections</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{yours.map(card)}</div>
        </div>
      ) : null}

      {available.length ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              {yours.length ? "Add more tools" : "Connect your first tool"}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              After connecting, finish any setup step it asks for, then click Sync now.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{available.map(card)}</div>
        </div>
      ) : null}

      <details className="group/log rounded-2xl border border-zinc-200/80 bg-white/60 px-5 py-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-zinc-600 hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
          Sync history <span className="font-normal text-zinc-400">· for troubleshooting</span>
        </summary>
        <div className="mt-4 space-y-3">
          {!logs?.length ? (
            <div className="card text-zinc-500">
              No sync runs yet. Connect a tool and click Sync now.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="p-3">Provider</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Started</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Received</th>
                    <th className="p-3">Imported</th>
                    <th className="p-3">Skipped</th>
                    <th className="p-3">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr className="border-b last:border-0" key={log.id}>
                      <td className="p-3">
                        {providers.find((provider) => provider.id === log.provider)?.displayName ??
                          log.provider}
                      </td>
                      <td className="p-3" title={log.error_message ?? undefined}>
                        {log.status}
                        {log.rate_limited ? " · rate limited" : ""}
                      </td>
                      <td className="p-3">{new Date(log.started_at).toLocaleString()}</td>
                      <td className="p-3">
                        {log.duration_ms === null ? "n/a" : `${log.duration_ms}ms`}
                      </td>
                      <td className="p-3">{log.records_received}</td>
                      <td className="p-3">{log.events_imported}</td>
                      <td className="p-3">{log.events_skipped}</td>
                      <td className="p-3" title={log.error_message ?? undefined}>
                        {log.error_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
