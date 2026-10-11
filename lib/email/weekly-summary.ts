import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import type {JobMetrics} from "@/lib/jobs/types";
import {loadPerformance} from "@/lib/home/load-performance";
import {steadyLines, type Metric} from "@/lib/home/performance";
import {providerLabel} from "@/lib/ui/labels";
import {organisationBillingActive} from "@/lib/billing/access";
import {deliverEmails} from "./outbox";
import {emailConfig, type Env} from "./resend";
import {weeklySummaryEmail, type WeeklyFigure} from "./templates";
import {unsubscribeToken} from "./unsubscribe";

type Client = SupabaseClient<Database>;
/** Sent from this hour on Monday, local to the organisation. */
export const SEND_FROM_HOUR = 7;
const skip = (reason: string): JobMetrics => ({
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 1,
  metadata: {reason},
});

/** Monday-morning check in the organisation's own time zone, plus a key for this week. */
export function mondayMorning(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    due: parts.weekday === "Mon" && Number(parts.hour) >= SEND_FROM_HOUR,
    weekKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** "4–10 October" for the seven days before today, in the organisation's time zone. */
export function lastWeekLabel(now: Date, timeZone: string) {
  const day = (offset: number, options: Intl.DateTimeFormatOptions) =>
    new Date(now.getTime() - offset * 86_400_000).toLocaleDateString("en-GB", {
      timeZone,
      ...options,
    });
  const start = day(7, {day: "numeric", month: "long"}),
    end = day(1, {day: "numeric", month: "long"}),
    sameMonth = day(7, {month: "long"}) === day(1, {month: "long"});
  return sameMonth ? `${start.split(" ")[0]}–${end}` : `${start} – ${end}`;
}

/** Figures worth showing: ones with something to compare, biggest moves first. */
export function emailFigures(metrics: Metric[]): WeeklyFigure[] {
  return [...metrics]
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
    .map((m) => ({
      label: m.label,
      value: m.value,
      change: m.comparable ? m.change : null,
      good: m.higherIsBetter,
    }));
}

/**
 * Background job: on Monday morning (organisation time), emails each member a summary of the
 * week. Runs hourly; the per-person, per-week key means it's only ever sent once.
 */
export async function runWeeklySummary(
  client: Client,
  organisationId: string,
  env: Env = process.env,
  now = new Date(),
): Promise<JobMetrics> {
  const config = emailConfig(env);
  if (!config) return skip("Email isn't configured.");
  const {data: organisation} = await client
    .from("organisations")
    .select("name,timezone")
    .eq("id", organisationId)
    .maybeSingle();
  if (!organisation) return skip("Organisation not found.");
  const timeZone = organisation.timezone || "Europe/London",
    {due, weekKey} = mondayMorning(now, timeZone);
  if (!due) return skip("Not Monday morning yet.");
  if (!(await organisationBillingActive(client, organisationId)))
    return skip("Subscription isn't active.");

  const [
    performance,
    {data: members},
    {data: optOuts},
    {count: alerts},
    {count: approvals},
    {data: integrations},
  ] = await Promise.all([
    loadPerformance(client, organisationId, "week", now),
    client
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
    client.from("weekly_summary_opt_outs").select("user_id").eq("organisation_id", organisationId),
    client
      .from("notifications")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", organisationId)
      .eq("status", "open")
      .in("severity", ["warning", "critical"]),
    client
      .from("workflow_approvals")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", organisationId)
      .eq("status", "pending"),
    client
      .from("integrations")
      .select("provider,status")
      .eq("organisation_id", organisationId)
      .in("status", ["expired", "error"]),
  ]);

  const {metrics, highlights} = performance,
    broken = (integrations ?? []).map((i) => `${providerLabel(i.provider)} needs reconnecting`),
    good = highlights.filter((h) => h.tone === "good").map((h) => h.text),
    goingWell = good.length ? good : steadyLines(metrics),
    needsLook = [...highlights.filter((h) => h.tone === "bad").map((h) => h.text), ...broken],
    reasons = Object.fromEntries(
      highlights.flatMap((h) => (h.tone === "bad" && h.why ? [[h.text, h.why]] : [])),
    ),
    waiting = (alerts ?? 0) + (approvals ?? 0);
  // Nothing to say is better than an empty email.
  if (!metrics.length && !needsLook.length && !waiting) return skip("Nothing to report this week.");

  const opted = new Set((optOuts ?? []).map((o) => o.user_id)),
    recipients = (members ?? []).map((m) => m.user_id).filter((id) => !opted.has(id));
  if (!recipients.length) return skip("Everyone has turned the Monday email off.");
  const {data: profiles} = await client
    .from("profiles")
    .select("id,full_name")
    .in("id", recipients);
  const firstNames = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim().split(/\s+/)[0] || null]),
  );

  const weekLabel = lastWeekLabel(now, timeZone),
    figures = emailFigures(metrics),
    rows = [];
  for (const userId of recipients) {
    const {data} = await client.auth.admin.getUserById(userId),
      to = data.user?.email;
    if (!to) continue;
    const email = weeklySummaryEmail({
      appUrl: config.appUrl,
      organisationName: organisation.name,
      firstName: firstNames.get(userId) ?? null,
      weekLabel,
      goingWell,
      needsLook,
      reasons,
      figures,
      waiting,
      unsubscribeUrl: `${config.appUrl}/unsubscribe?token=${unsubscribeToken(organisationId, userId)}`,
    });
    rows.push({
      organisation_id: organisationId,
      user_id: userId,
      kind: "weekly_summary" as const,
      source_id: organisationId,
      // Once per person, per organisation, per week, however often the job runs.
      dedupe_key: `weekly_summary:${organisationId}:${weekKey}:${userId}`,
      recipient_email: to,
      subject: email.subject,
      html_body: email.html,
      text_body: email.text,
    });
  }
  if (!rows.length) return skip("No recipients with an email address.");
  const {data: queued, error} = await client
    .from("email_outbox")
    .upsert(rows, {onConflict: "dedupe_key", ignoreDuplicates: true})
    .select("id");
  if (error) throw new Error("Monday emails could not be queued.");
  const delivery = await deliverEmails(client, organisationId, config);
  return {
    processed: rows.length,
    created: queued?.length ?? 0,
    updated: delivery.sent,
    skipped: delivery.failed,
    metadata: {weekKey},
  };
}
