import Link from "next/link";
import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {SeverityBadge} from "@/components/severity-badge";
import {notificationAction} from "@/app/notification-actions";
import {
  humanCategory,
  humanizeNotificationDisplay,
  titleCase,
} from "@/lib/ui/labels";

const json = (value: unknown) => JSON.stringify(value, null, 2);

export default async function NotificationDetail({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const {id} = await params;
  const p = await searchParams;

  const [
    {data: item},
    {data: evidence},
    {data: revisions},
    {data: assignments},
    {data: members},
    {data: profiles},
    {data: jobs},
    {data: integrations},
  ] = await Promise.all([
    ctx.supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .eq("organisation_id", ctx.organisation.id)
      .maybeSingle(),
    ctx.supabase
      .from("notification_evidence")
      .select("*")
      .eq("notification_id", id)
      .eq("organisation_id", ctx.organisation.id)
      .order("occurred_at", {ascending: false})
      .limit(200),
    ctx.supabase
      .from("notification_revisions")
      .select("*")
      .eq("notification_id", id)
      .eq("organisation_id", ctx.organisation.id)
      .order("revision_number", {ascending: false})
      .limit(200),
    ctx.supabase
      .from("notification_assignments")
      .select("*")
      .eq("notification_id", id)
      .eq("organisation_id", ctx.organisation.id)
      .order("assigned_at", {ascending: false})
      .limit(100),
    ctx.supabase
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", ctx.organisation.id)
      .eq("status", "active"),
    ctx.supabase.from("profiles").select("id,full_name").limit(500),
    ctx.supabase
      .from("background_jobs")
      .select("id,job_key,provider")
      .eq("organisation_id", ctx.organisation.id),
    ctx.supabase
      .from("integrations")
      .select("id,provider,provider_account_name")
      .eq("organisation_id", ctx.organisation.id),
  ]);

  if (!item) notFound();

  const names = new Map(
    (profiles ?? []).map((x) => [x.id, x.full_name ?? x.id.slice(0, 8)]),
  );
  const jobById = new Map(
    (jobs ?? []).map((j) => [j.id, {job_key: j.job_key, provider: j.provider}]),
  );
  const integrationById = new Map(
    (integrations ?? []).map((i) => [
      i.id,
      {provider: i.provider, name: i.provider_account_name},
    ]),
  );

  const display = humanizeNotificationDisplay({
    title: item.title,
    summary: item.summary,
    recommendedAction: item.recommended_action,
    explanation: item.explanation,
    ruleKey: item.rule_key,
    sourceType: item.source_type,
    sourceId: item.source_id,
    jobById,
    integrationById,
  });

  const role = ctx.membership.role as OrganisationRole;
  const canAck = hasPermission(role, "notifications.acknowledge");
  const canResolve = hasPermission(role, "notifications.resolve");
  const canDismiss = hasPermission(role, "notifications.dismiss");
  const canAssign = hasPermission(role, "notifications.assign");
  const returnTo = `/app/action-centre/${item.id}`;

  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/action-centre">
        Back to Action Centre
      </Link>
      <Notice searchParams={p} />

      <header className="card">
        <div className="flex flex-wrap gap-2">
          <SeverityBadge value={item.severity} />
          <span className="badge badge-muted">{titleCase(item.status)}</span>
          <span className="badge badge-muted">{humanCategory(item.category)}</span>
        </div>
        <h2 className="mt-3 text-2xl font-bold">{display.title}</h2>
        <p className="mt-2 text-zinc-700">{display.summary}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Category</dt>
            <dd>{humanCategory(item.category)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Assigned</dt>
            <dd>
              {item.assigned_user_id
                ? (names.get(item.assigned_user_id) ?? "Teammate")
                : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Times seen</dt>
            <dd>{item.occurrence_count}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">First seen</dt>
            <dd>{new Date(item.first_detected_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Last seen</dt>
            <dd>{new Date(item.last_detected_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Related page</dt>
            <dd>
              {item.source_type === "background_job" ? (
                <Link className="underline" href="/app/jobs">
                  Background Jobs
                </Link>
              ) : item.source_type === "integration" ? (
                <Link className="underline" href="/app/integrations">
                  Integrations
                </Link>
              ) : item.source_type === "correlation" ? (
                <Link className="underline" href={`/app/correlations/${item.source_id}`}>
                  Correlation
                </Link>
              ) : (
                titleCase(item.source_type)
              )}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="card">
            <h3 className="font-semibold">What this means</h3>
            <p className="mt-2 text-zinc-700">
              {display.explanation ?? item.explanation}
            </p>
            <p className="mt-4 rounded-lg bg-violet-50 p-3 text-sm font-medium text-violet-950">
              What to do: {display.recommendedAction}
            </p>
          </article>

          <article className="card">
            <h3 className="font-semibold">Structured evidence</h3>
            {!evidence?.length ? (
              <p className="mt-2 text-zinc-500">No evidence was stored.</p>
            ) : (
              evidence.map((e) => (
                <div className="mt-3 border-t pt-3" key={e.id}>
                  <div className="flex justify-between gap-2">
                    <strong>{e.label}</strong>
                    <time className="text-xs text-zinc-500">
                      {new Date(e.occurred_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-sm text-zinc-700">{e.description}</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <pre className="overflow-auto rounded bg-zinc-50 p-2 text-xs">
                      Observed: {json(e.observed_value_json)}
                    </pre>
                    {e.expected_value_json !== null ? (
                      <pre className="overflow-auto rounded bg-zinc-50 p-2 text-xs">
                        Expected: {json(e.expected_value_json)}
                      </pre>
                    ) : null}
                  </div>
                  {e.correlation_id ? (
                    <Link
                      className="mt-2 inline-block text-sm underline"
                      href={`/app/correlations/${e.correlation_id}`}
                    >
                      Open related correlation
                    </Link>
                  ) : null}
                  {e.job_run_id ? (
                    <Link className="mt-2 ml-3 inline-block text-sm underline" href="/app/jobs">
                      Open Background Jobs
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </article>

          <article className="card">
            <h3 className="font-semibold">History</h3>
            {revisions?.map((r) => (
              <div className="mt-3 border-t pt-3 text-sm" key={r.id}>
                <strong>
                  #{r.revision_number} {titleCase(r.change_type)}
                </strong>
                <span className="ml-2 text-zinc-500">
                  {new Date(r.created_at).toLocaleString()}
                </span>
                <p>{r.reason}</p>
                <p className="text-xs text-zinc-500">
                  {r.previous_status ? titleCase(r.previous_status) : "None"} to{" "}
                  {r.new_status ? titleCase(r.new_status) : "None"}
                </p>
              </div>
            ))}
          </article>
        </div>

        <aside className="space-y-4">
          <div className="card">
            <h3 className="font-semibold">Actions</h3>
            {canAck ? (
              <form action={notificationAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="button w-full" name="action" value="acknowledge">
                  Acknowledge
                </button>
                <input className="field w-full" name="snoozedUntil" type="datetime-local" />
                <button className="button button-secondary w-full" name="action" value="snooze">
                  Snooze
                </button>
                {item.status === "snoozed" ? (
                  <button
                    className="button button-secondary w-full"
                    name="action"
                    value="unsnooze"
                  >
                    Unsnooze
                  </button>
                ) : null}
              </form>
            ) : null}
            {canAssign ? (
              <form action={notificationAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <select className="field w-full" name="assignedUserId" required>
                  {(members ?? []).map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {names.get(x.user_id) ?? x.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <button className="button button-secondary w-full" name="action" value="assign">
                  Assign
                </button>
                {item.assigned_user_id ? (
                  <button
                    className="button button-secondary w-full"
                    name="action"
                    value="unassign"
                  >
                    Unassign
                  </button>
                ) : null}
              </form>
            ) : null}
            {canResolve || canDismiss ? (
              <form action={notificationAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <textarea
                  className="field w-full"
                  name="reason"
                  placeholder="Required reason"
                  required
                />
                {canResolve && item.status !== "resolved" ? (
                  <button className="button w-full" name="action" value="resolve">
                    Resolve
                  </button>
                ) : null}
                {canDismiss && item.status !== "dismissed" ? (
                  <button
                    className="button button-secondary w-full"
                    name="action"
                    value="dismiss"
                  >
                    Dismiss
                  </button>
                ) : null}
                {canResolve && ["resolved", "dismissed"].includes(item.status) ? (
                  <button
                    className="button button-secondary w-full"
                    name="action"
                    value="reopen"
                  >
                    Reopen
                  </button>
                ) : null}
              </form>
            ) : null}
          </div>
          <div className="card">
            <h3 className="font-semibold">Assignment history</h3>
            {!assignments?.length ? (
              <p className="text-sm text-zinc-500">Never assigned.</p>
            ) : (
              assignments.map((a) => (
                <p className="mt-2 text-sm" key={a.id}>
                  {names.get(a.assigned_user_id) ?? a.assigned_user_id} ·{" "}
                  {new Date(a.assigned_at).toLocaleString()}
                  {a.unassigned_at ? " · unassigned" : ""}
                </p>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
