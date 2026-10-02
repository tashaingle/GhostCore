import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import type {JobMetrics} from "@/lib/jobs/types";
import {approvalRecipients, notificationRecipients, type Member} from "./recipients";
import {EmailError, emailConfig, sendEmail, type EmailConfig, type Env} from "./resend";
import {approvalEmail, notificationEmail, type RenderedEmail} from "./templates";

type Client = SupabaseClient<Database>;
type OutboxInsert = Database["public"]["Tables"]["email_outbox"]["Insert"];

/** Only items created this recently are emailed, so enabling delivery never sends a backlog. */
export const EMAIL_LOOKBACK_HOURS = 6;
export const EMAIL_MAX_ATTEMPTS = 5;
const SCAN_LIMIT = 100;
const SEND_LIMIT = 50;
const RETENTION_DAYS = 30;

export const retryDelayMs = (attempts: number) => Math.min(3_600_000, 60_000 * 2 ** attempts);

async function recipientEmails(client: Client, userIds: string[]) {
  const emails = new Map<string, string>();
  for (const id of new Set(userIds)) {
    const {data} = await client.auth.admin.getUserById(id);
    if (data.user?.email) emails.set(id, data.user.email);
  }
  return emails;
}

/** Scans recent notifications and pending approvals and queues one email per recipient. */
export async function queueEmails(client: Client, organisationId: string, config: EmailConfig) {
  const since = new Date(Date.now() - EMAIL_LOOKBACK_HOURS * 3_600_000).toISOString();
  const [{data: organisation}, {data: members}, {data: preferences}, {data: notifications}] =
    await Promise.all([
      client.from("organisations").select("name").eq("id", organisationId).maybeSingle(),
      client
        .from("organisation_members")
        .select("user_id,role")
        .eq("organisation_id", organisationId)
        .eq("status", "active"),
      client.from("notification_preferences").select("*").eq("organisation_id", organisationId),
      client
        .from("notifications")
        .select("id,title,summary,recommended_action,severity,category")
        .eq("organisation_id", organisationId)
        .eq("status", "open")
        .gte("created_at", since)
        .order("created_at")
        .limit(SCAN_LIMIT),
    ]);
  const {data: approvals} = await client
    .from("workflow_approvals")
    .select("id,run_id,approver_user_id,approver_role,due_at")
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at")
    .limit(SCAN_LIMIT);

  const people: Member[] = members ?? [],
    prefs = preferences ?? [],
    organisationName = organisation?.name ?? "your organisation",
    planned: {
      userId: string;
      kind: "notification" | "approval";
      sourceId: string;
      email: RenderedEmail;
    }[] = [];

  for (const n of notifications ?? []) {
    const email = notificationEmail({appUrl: config.appUrl, organisationName, notification: n});
    for (const userId of notificationRecipients(people, prefs, n))
      planned.push({userId, kind: "notification", sourceId: n.id, email});
  }

  if (approvals?.length) {
    const {data: runs} = await client
        .from("workflow_runs")
        .select("id,workflow_id")
        .eq("organisation_id", organisationId)
        .in(
          "id",
          approvals.map((a) => a.run_id),
        ),
      {data: workflows} = runs?.length
        ? await client
            .from("workflow_definitions")
            .select("id,name")
            .eq("organisation_id", organisationId)
            .in(
              "id",
              runs.map((r) => r.workflow_id),
            )
        : {data: []},
      workflowName = (runId: string) => {
        const run = runs?.find((r) => r.id === runId);
        return workflows?.find((w) => w.id === run?.workflow_id)?.name ?? null;
      };
    for (const a of approvals) {
      const email = approvalEmail({
        appUrl: config.appUrl,
        organisationName,
        workflowName: workflowName(a.run_id),
        approval: a,
      });
      for (const userId of approvalRecipients(people, prefs, a))
        planned.push({userId, kind: "approval", sourceId: a.id, email});
    }
  }

  if (!planned.length) return 0;
  const emails = await recipientEmails(
      client,
      planned.map((p) => p.userId),
    ),
    rows: OutboxInsert[] = planned.flatMap((p) => {
      const to = emails.get(p.userId);
      return to
        ? [
            {
              organisation_id: organisationId,
              user_id: p.userId,
              kind: p.kind,
              source_id: p.sourceId,
              dedupe_key: `${p.kind}:${p.sourceId}:${p.userId}`,
              recipient_email: to,
              subject: p.email.subject,
              html_body: p.email.html,
              text_body: p.email.text,
            },
          ]
        : [];
    });
  if (!rows.length) return 0;
  const {data: inserted, error} = await client
    .from("email_outbox")
    .upsert(rows, {onConflict: "dedupe_key", ignoreDuplicates: true})
    .select("id");
  if (error) throw new Error("Emails could not be queued.");
  return inserted?.length ?? 0;
}

/** Sends due outbox rows, retrying temporary failures with exponential backoff. */
export async function deliverEmails(
  client: Client,
  organisationId: string,
  config: EmailConfig,
  request: typeof fetch = fetch,
) {
  const now = new Date(),
    {data: due} = await client
      .from("email_outbox")
      .select("id,recipient_email,subject,html_body,text_body,dedupe_key,attempts")
      .eq("organisation_id", organisationId)
      .eq("status", "pending")
      .lte("next_attempt_at", now.toISOString())
      .order("next_attempt_at")
      .limit(SEND_LIMIT);
  let sent = 0,
    retrying = 0,
    failed = 0;
  for (const row of due ?? []) {
    try {
      const result = await sendEmail(
        config,
        {
          to: row.recipient_email,
          subject: row.subject,
          html: row.html_body,
          text: row.text_body,
          idempotencyKey: row.dedupe_key,
        },
        request,
      );
      await client
        .from("email_outbox")
        .update({
          status: "sent",
          attempts: row.attempts + 1,
          provider_message_id: result.id,
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1,
        retry = error instanceof EmailError && error.retryable && attempts < EMAIL_MAX_ATTEMPTS;
      await client
        .from("email_outbox")
        .update({
          status: retry ? "pending" : "failed",
          attempts,
          next_attempt_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
          last_error: error instanceof EmailError ? error.message : "Email could not be sent.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (retry) retrying++;
      else failed++;
    }
  }
  return {due: due?.length ?? 0, sent, retrying, failed};
}

/** Background job entry point for `email.deliver`. */
export async function runEmailDelivery(
  client: Client,
  organisationId: string,
  env: Env = process.env,
  request: typeof fetch = fetch,
): Promise<JobMetrics> {
  const config = emailConfig(env);
  if (!config)
    return {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      metadata: {configured: false, reason: "Set RESEND_API_KEY and EMAIL_FROM to send email."},
    };
  const queued = await queueEmails(client, organisationId, config),
    delivery = await deliverEmails(client, organisationId, config, request);
  await client
    .from("email_outbox")
    .delete()
    .eq("organisation_id", organisationId)
    .in("status", ["sent", "failed"])
    .lt("created_at", new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());
  return {
    processed: delivery.due,
    created: queued,
    updated: delivery.sent,
    skipped: delivery.failed,
    metadata: {configured: true, retrying: delivery.retrying},
  };
}
