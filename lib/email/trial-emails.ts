import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import type {JobMetrics} from "@/lib/jobs/types";
import {providerLabel} from "@/lib/ui/labels";
import {monthlyMinor, PLAN, pounds} from "@/lib/billing/plan";
import {deliverEmails} from "./outbox";
import {emailConfig, type Env} from "./resend";
import {trialDayOneEmail, trialEndingEmail, type TrialProgress} from "./templates";

type Client = SupabaseClient<Database>;
const DAY = 86_400_000;
const skip = (reason: string): JobMetrics => ({
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 1,
  metadata: {reason},
});

/**
 * Which trial email is due, if any: day one (a day after starting) or "ending soon" (in the last
 * two days, unless they've already cancelled).
 */
export function trialStage(
  account: {status: string; trial_ends_at: string | null; cancel_at_period_end: boolean},
  now: Date,
): "day_one" | "ending" | null {
  if (account.status !== "trialing" || !account.trial_ends_at) return null;
  const end = Date.parse(account.trial_ends_at),
    start = end - PLAN.trialDays * DAY,
    t = now.getTime();
  if (t >= end) return null;
  if (end - t <= 2 * DAY) return account.cancel_at_period_end ? null : "ending";
  if (t >= start + DAY) return "day_one";
  return null;
}

/**
 * Background job: sends the trial emails to the person who started the trial. Runs hourly per
 * organisation, but only acts for the person's first organisation so each email goes once.
 */
export async function runTrialEmails(
  client: Client,
  organisationId: string,
  env: Env = process.env,
  now = new Date(),
): Promise<JobMetrics> {
  const config = emailConfig(env);
  if (!config) return skip("Email isn't configured.");
  const {data: organisation} = await client
    .from("organisations")
    .select("id,name,created_by,timezone")
    .eq("id", organisationId)
    .maybeSingle();
  if (!organisation) return skip("Organisation not found.");
  const owner = organisation.created_by;

  const [{data: first}, {data: account}] = await Promise.all([
    client
      .from("organisations")
      .select("id")
      .eq("created_by", owner)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    client.from("billing_accounts").select("*").eq("user_id", owner).maybeSingle(),
  ]);
  if (first?.id !== organisationId) return skip("Handled by the person's first organisation.");
  if (!account || account.comped) return skip("No trial.");
  const stage = trialStage(account, now);
  if (!stage) return skip("No trial email due.");

  const trialStart = new Date(Date.parse(account.trial_ends_at!) - PLAN.trialDays * DAY);
  const [
    {data: integrations},
    {count: updates},
    {data: insights},
    {count: members},
    {count: owned},
    {data: profile},
    {data: user},
  ] = await Promise.all([
    client
      .from("integrations")
      .select("provider")
      .eq("organisation_id", organisationId)
      .neq("status", "disconnected"),
    client
      .from("events")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", organisationId)
      .neq("source", "ghost")
      .gte("created_at", trialStart.toISOString()),
    client
      .from("insights")
      .select("title")
      .eq("organisation_id", organisationId)
      .in("status", ["active", "acknowledged"])
      .order("updated_at", {ascending: false})
      .limit(3),
    client
      .from("organisation_members")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
    client.from("organisations").select("id", {count: "exact", head: true}).eq("created_by", owner),
    client.from("profiles").select("full_name").eq("id", owner).maybeSingle(),
    client.auth.admin.getUserById(owner),
  ]);
  const to = user.user?.email;
  if (!to) return skip("No email address.");

  const progress: TrialProgress = {
    organisationName: organisation.name,
    firstName: profile?.full_name?.trim().split(/\s+/)[0] || null,
    tools: [...new Set((integrations ?? []).map((i) => providerLabel(i.provider)))],
    updates: updates ?? 0,
    noticed: (insights ?? []).map((i) => i.title),
    teammates: Math.max(0, (members ?? 1) - 1),
  };
  const email =
    stage === "day_one"
      ? trialDayOneEmail({...progress, appUrl: config.appUrl})
      : trialEndingEmail({
          ...progress,
          appUrl: config.appUrl,
          endsOn: new Date(account.trial_ends_at!).toLocaleDateString("en-GB", {
            timeZone: organisation.timezone || "Europe/London",
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
          price: pounds(monthlyMinor(owned ?? 1)),
        });

  const {data: queued, error} = await client
    .from("email_outbox")
    .upsert(
      {
        organisation_id: organisationId,
        user_id: owner,
        kind: "trial",
        source_id: organisationId,
        // Once per person per trial, whichever organisation's job runs.
        dedupe_key: `trial_${stage}:${owner}:${account.trial_ends_at!.slice(0, 10)}`,
        recipient_email: to,
        subject: email.subject,
        html_body: email.html,
        text_body: email.text,
      },
      {onConflict: "dedupe_key", ignoreDuplicates: true},
    )
    .select("id");
  if (error) throw new Error("The trial email could not be queued.");
  const delivery = await deliverEmails(client, organisationId, config);
  return {
    processed: 1,
    created: queued?.length ?? 0,
    updated: delivery.sent,
    skipped: delivery.failed,
    metadata: {stage},
  };
}
