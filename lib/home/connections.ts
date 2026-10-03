import type {ProviderDefinition} from "@/lib/integrations/registry";

export type ConnectionRow = {
  id: string;
  provider: string;
  provider_account_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  settings: unknown;
};

export type ConnectionState = "expired" | "failing" | "stale" | "setup" | "syncing" | "healthy";

export type ConnectionStatus = {
  id: string;
  name: string;
  account: string | null;
  state: ConnectionState;
  /** Short, plain-English status shown to people. */
  label: string;
  detail: string;
  needsAttention: boolean;
  action: {label: string; href: string} | null;
};

/** How long a connection can go without a successful sync before we call it out. */
const STALE_AFTER_HOURS: Record<string, number | null> = {
  hourly: 6,
  daily: 48,
  webhook: 48,
  manual: null,
};

const HOUR_MS = 3_600_000;

export function timeAgo(iso: string | null, now = new Date()) {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `on ${new Date(iso).toLocaleDateString("en-GB", {day: "numeric", month: "short"})}`;
}

export function reconnectHref(
  provider: ProviderDefinition | undefined,
  settings: Record<string, unknown>,
) {
  if (!provider?.connectPath) return "/app/integrations";
  // Shopify's connect flow needs the store domain it is reconnecting to.
  if (provider.id === "shopify" && typeof settings.shop === "string")
    return `${provider.connectPath}?shop=${encodeURIComponent(settings.shop)}`;
  return provider.connectPath;
}

/**
 * One status per connection, so every page describes a connection the same way. The order
 * matters: an expired login explains a failing or stale sync, so it is reported instead of them.
 */
export function connectionStatus(
  row: ConnectionRow,
  provider: ProviderDefinition | undefined,
  now = new Date(),
): ConnectionStatus {
  const settings = (row.settings && typeof row.settings === "object" ? row.settings : {}) as Record<
      string,
      unknown
    >,
    name = provider?.displayName ?? row.provider,
    base = {id: row.id, name, account: row.provider_account_name},
    lastSync = timeAgo(row.last_sync_at, now);

  if (row.status === "expired")
    return {
      ...base,
      state: "expired",
      label: "Login expired",
      detail: `${name} stopped sharing data. Last synced ${lastSync}.`,
      needsAttention: true,
      action: {label: "Reconnect", href: reconnectHref(provider, settings)},
    };
  if (row.status === "error" || row.last_sync_status === "error")
    return {
      ...base,
      state: "failing",
      label: "Sync failing",
      detail: `The last sync didn't finish. Last successful sync ${lastSync}.`,
      needsAttention: true,
      action: {label: "View", href: "/app/integrations"},
    };
  if (settings.configurationStatus === "property_required")
    return {
      ...base,
      state: "setup",
      label: "Finish setup",
      detail: "Choose what to import before Metric Mage can sync.",
      needsAttention: true,
      action: {label: "Finish setup", href: provider?.configurationPath ?? "/app/integrations"},
    };
  if (row.status === "syncing")
    return {
      ...base,
      state: "syncing",
      label: "Syncing",
      detail: "Importing the latest activity now.",
      needsAttention: false,
      action: null,
    };
  const staleAfter = STALE_AFTER_HOURS[provider?.schedule ?? "manual"] ?? null,
    ageHours = row.last_sync_at ? (now.getTime() - Date.parse(row.last_sync_at)) / HOUR_MS : null;
  if (staleAfter !== null && (ageHours === null || ageHours > staleAfter))
    return {
      ...base,
      state: "stale",
      label: "Not syncing",
      detail: row.last_sync_at
        ? `No new data coming in. Last synced ${lastSync}.`
        : "Connected, but it hasn't synced yet.",
      needsAttention: true,
      action: {label: "View", href: "/app/integrations"},
    };
  return {
    ...base,
    state: "healthy",
    label: "Up to date",
    detail: `Last synced ${lastSync}.`,
    needsAttention: false,
    action: null,
  };
}

const ATTENTION_ORDER: Record<ConnectionState, number> = {
  expired: 0,
  failing: 1,
  setup: 2,
  stale: 3,
  syncing: 4,
  healthy: 5,
};

export const sortConnections = (items: ConnectionStatus[]) =>
  [...items].sort(
    (a, b) => ATTENTION_ORDER[a.state] - ATTENTION_ORDER[b.state] || a.name.localeCompare(b.name),
  );
