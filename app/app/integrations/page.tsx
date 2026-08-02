import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasCapability, providers, type ProviderDefinition} from "@/lib/integrations/registry";
import {healthFromStatus, healthLabels} from "@/lib/integrations/health";
import {disconnectIntegration, syncIntegration} from "@/app/integration-actions";
import {ConnectProviderButton} from "@/components/connect-provider-button";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {configureIntegrationLabel} from "@/lib/ui/labels";
import type {Json} from "@/types/database";

const healthStyles = {
  healthy: "bg-green-100 text-green-800",
  syncing: "bg-blue-100 text-blue-800",
  error: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
  disconnected: "bg-zinc-100 text-zinc-700",
  unknown: "bg-zinc-100 text-zinc-700",
} as const;

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
  const connected =
    integration && !["disconnected", "expired"].includes(integration.status);
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
      return (
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
      {provider.connectPath ? (
        <Link className="button button-secondary" href={provider.connectPath}>
          Reconnect
        </Link>
      ) : null}
      <form action={syncIntegration}>
        <input type="hidden" name="integrationId" value={integration.id} />
        <button
          className="button"
          disabled={integration.status === "syncing" || configurationRequired}
          title={
            configurationRequired
              ? "Finish setup before syncing"
              : "Import latest activity"
          }
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

  const byProvider = new Map(
    integrations?.map((integration) => [integration.provider, integration]),
  );
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const connectedCount =
    integrations?.filter((i) => !["disconnected", "expired"].includes(i.status))
      .length ?? 0;
  const needsSetup =
    integrations?.filter((i) => {
      const settings = (i.settings ?? {}) as Record<string, unknown>;
      return (
        !["disconnected", "expired"].includes(i.status) &&
        settings.configurationStatus === "property_required"
      );
    }).length ?? 0;

  return (
    <section className="space-y-8">
      <PageHeader
        title="Integrations"
        description="Connect the tools your team already uses. Ghost only requests read access."
      />
      <Notice searchParams={params} />

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="card">
          <p className="text-sm text-zinc-500">Connected</p>
          <p className="mt-1 text-2xl font-bold">{connectedCount}</p>
        </article>
        <article className="card">
          <p className="text-sm text-zinc-500">Need setup</p>
          <p className="mt-1 text-2xl font-bold">{needsSetup}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Channels, properties or accounts still to choose
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-zinc-500">Tip</p>
          <p className="mt-1 text-sm text-zinc-700">
            After connecting, finish setup if prompted, then click <strong>Sync now</strong>.
          </p>
        </article>
      </div>

      {needsSetup > 0 ? (
        <p className="info-banner">
          Some tools need a quick setup step (for example Slack channels or analytics
          properties) before Sync will run.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider: ProviderDefinition) => {
          const integration = byProvider.get(provider.id);
          const health = healthFromStatus(integration?.status);
          return (
            <article className="card flex min-h-72 flex-col gap-4" key={provider.id}>
              <div className="flex items-start gap-3">
                <span
                  className="grid size-11 place-items-center rounded-xl text-sm font-bold text-white"
                  style={{backgroundColor: provider.colour}}
                >
                  {provider.icon}
                </span>
                <div>
                  <h3 className="font-semibold">{provider.displayName}</h3>
                  <p className="text-xs text-zinc-500">
                    {provider.category} · {provider.recommendedFrequency}
                  </p>
                </div>
                <span
                  className={`ml-auto rounded-full px-2 py-1 text-xs font-medium ${healthStyles[health]}`}
                >
                  {healthLabels[health]}
                </span>
              </div>

              <p className="text-sm text-zinc-600">
                {provider.description ??
                  "Bring this provider into your organisation timeline."}
              </p>

              <div className="text-sm text-zinc-600">
                {integration ? (
                  <>
                    <p className="font-medium text-zinc-800">
                      {integration.provider_account_name || "Connected account"}
                    </p>
                    <p className="mt-1 text-xs capitalize text-zinc-500">
                      Status: {integration.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {integration.last_sync_at
                        ? `Last sync ${new Date(integration.last_sync_at).toLocaleString()}`
                        : "Never synced"}
                    </p>
                    {integration.last_sync_error ? (
                      <p className="mt-2 text-sm text-red-700">
                        {integration.last_sync_error}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-zinc-500">Not connected yet</p>
                )}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Controls
                  provider={provider}
                  integration={integration}
                  siteUrl={siteUrl}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Recent sync activity</h3>
          <p className="text-sm text-zinc-500">
            Technical log of connector runs (separate from your business timeline).
          </p>
        </div>
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
                      {providers.find((provider) => provider.id === log.provider)
                        ?.displayName ?? log.provider}
                    </td>
                    <td className="p-3" title={log.error_message ?? undefined}>
                      {log.status}
                      {log.rate_limited ? " · rate limited" : ""}
                    </td>
                    <td className="p-3">
                      {new Date(log.started_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      {log.duration_ms === null ? "—" : `${log.duration_ms}ms`}
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
    </section>
  );
}
