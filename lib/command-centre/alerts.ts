import {connectionStatus} from "@/lib/home/connections";
import {getProvider} from "@/lib/integrations/registry";
import type {CommandAlert, CommandEvent, CommandIntegration} from "./types";
export function commandAlerts(
  integrations: CommandIntegration[],
  events: CommandEvent[],
  insights: {id: string; title: string; summary: string; severity: string}[],
  failedRuns: {id: string; error: string | null; started_at: string}[],
  now = new Date(),
) {
  const alerts: CommandAlert[] = [];
  for (const item of integrations) {
    if (item.status === "disconnected") continue;
    // One alert per connection, worded the same as the home and Connections pages.
    const status = connectionStatus(item, getProvider(item.provider), now);
    if (status.needsAttention) {
      alerts.push({
        id: `integration-${item.id}`,
        severity: status.state === "expired" || status.state === "failing" ? "critical" : "warning",
        title: `${status.name}: ${status.label.toLowerCase()}`,
        detail: status.detail,
        href: status.action?.href ?? "/app/integrations",
        evidence: item.provider_account_name ?? status.name,
      });
      continue;
    }
    if (item.token_expires_at) {
      const days = (Date.parse(item.token_expires_at) - now.getTime()) / 86400000;
      if (days >= 0 && days <= 7)
        alerts.push({
          id: `token-${item.id}`,
          severity: days <= 1 ? "critical" : "warning",
          title: `${status.name}: login expires soon`,
          detail: `Reconnect before ${new Date(item.token_expires_at).toLocaleDateString("en-GB", {day: "numeric", month: "short"})} to avoid a gap in your data.`,
          href: "/app/integrations",
          evidence: item.provider_account_name ?? status.name,
        });
    }
  }
  for (const event of events
    .filter(
      (e) =>
        // Ghost's own audit trail (alert, task and workflow changes) is not a business problem.
        e.source !== "ghost" &&
        (e.severity === "critical" || /failed|overdue|awaiting_payment/i.test(e.event_type)),
    )
    .slice(0, 20))
    alerts.push({
      id: `event-${event.id}`,
      severity: event.severity === "critical" ? "critical" : "warning",
      title: event.title,
      detail: event.description || `Detected from ${event.source}.`,
      href: `/app/timeline?q=${encodeURIComponent(event.title)}`,
      evidence: `${event.source} · ${event.event_type} · ${new Date(event.occurred_at).toLocaleString()}`,
    });
  for (const insight of insights)
    alerts.push({
      id: `insight-${insight.id}`,
      severity: insight.severity === "critical" ? "critical" : "warning",
      title: insight.title,
      detail: insight.summary,
      href: `/app/insights/${insight.id}`,
      evidence: "Ghost insight",
    });
  for (const run of failedRuns)
    alerts.push({
      id: `rule-${run.id}`,
      severity: "warning",
      title: "Checking for related events failed",
      detail: run.error || "Ghost couldn’t finish checking for related events.",
      href: "/app/correlations",
      evidence: `Run started ${new Date(run.started_at).toLocaleString()}`,
    });
  const rank = {critical: 0, warning: 1, information: 2};
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 30);
}
