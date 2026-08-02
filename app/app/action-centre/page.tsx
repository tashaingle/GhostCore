import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {SeverityBadge} from "@/components/severity-badge";
import {
  notificationAction,
  evaluateNotificationsAction,
} from "@/app/notification-actions";
import {
  notificationCategories,
  notificationSeverities,
  notificationStatuses,
} from "@/lib/notifications/types";
import {sortNotifications} from "@/lib/notifications/status";
import {
  humanCategory,
  humanizeNotificationDisplay,
  titleCase,
} from "@/lib/ui/labels";

export default async function ActionCentre({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const p = await searchParams;
  const value = (key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
  const status = value("status");
  const severity = value("severity");
  const category = value("category");
  const assignment = value("assignment");
  const rule = value("rule");
  const source = value("source");
  const q = value("q").slice(0, 100);
  const days = Math.min(365, Math.max(1, Number(value("days") || 30)));
  const now = new Date();

  let query = ctx.supabase
    .from("notifications")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .gte(
      "last_detected_at",
      new Date(now.getTime() - days * 86400000).toISOString(),
    )
    .order("last_detected_at", {ascending: false})
    .limit(200);

  if (status) query = query.eq("status", status);
  else query = query.or(`status.neq.snoozed,snoozed_until.lte.${now.toISOString()}`);
  if (severity) query = query.eq("severity", severity);
  if (category) query = query.eq("category", category);
  if (rule) query = query.eq("rule_key", rule);
  if (source) query = query.eq("source_type", source);
  if (assignment === "me") query = query.eq("assigned_user_id", ctx.user.id);
  if (assignment === "unassigned") query = query.is("assigned_user_id", null);
  if (q) {
    const safe = q.replace(/[%(),]/g, "");
    query = query.or(
      `title.ilike.%${safe}%,summary.ilike.%${safe}%,source_id.ilike.%${safe}%,rule_key.ilike.%${safe}%`,
    );
  }

  const [
    {data: rows},
    {data: all},
    {data: evidence},
    {data: members},
    {data: profiles},
    {data: jobs},
    {data: integrations},
  ] = await Promise.all([
    query,
    ctx.supabase
      .from("notifications")
      .select("id,status,severity,assigned_user_id,resolved_at,rule_key")
      .eq("organisation_id", ctx.organisation.id)
      .limit(1000),
    ctx.supabase
      .from("notification_evidence")
      .select("notification_id")
      .eq("organisation_id", ctx.organisation.id)
      .limit(5000),
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

  const profileMap = new Map(
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
  const counts = new Map<string, number>();
  for (const e of evidence ?? []) {
    counts.set(e.notification_id, (counts.get(e.notification_id) ?? 0) + 1);
  }

  const ordered = sortNotifications(rows ?? []).map((item) => {
    const display = humanizeNotificationDisplay({
      title: item.title,
      summary: item.summary,
      recommendedAction: item.recommended_action,
      ruleKey: item.rule_key,
      sourceType: item.source_type,
      sourceId: item.source_id,
      jobById,
      integrationById,
    });
    return {...item, display};
  });

  const open = (all ?? []).filter((x) =>
    ["open", "acknowledged", "snoozed"].includes(x.status),
  );
  const recent = new Date(now.getTime() - 7 * 86400000);
  const role = ctx.membership.role as OrganisationRole;
  const canAcknowledge = hasPermission(role, "notifications.acknowledge");
  const canResolve = hasPermission(role, "notifications.resolve");
  const canDismiss = hasPermission(role, "notifications.dismiss");
  const canAssign = hasPermission(role, "notifications.assign");
  const canEvaluate = hasPermission(role, "notifications.rules.manage");
  const rules = [
    ...new Set((rows ?? []).map((x) => x.rule_key).filter(Boolean)),
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        title="Action Centre"
        description="A simple to-do list from Ghost. Each item is something automatic that needs a person to check, fix, or dismiss."
        actions={
          <>
            <Link className="button button-secondary" href="/app/action-centre/preferences">
              Preferences
            </Link>
            {canEvaluate ? (
              <form action={evaluateNotificationsAction}>
                <button className="button">Refresh action list</button>
              </form>
            ) : null}
          </>
        }
      />
      <Notice searchParams={p} />

      <div className="info-banner">
        <strong>Not sure what an item means?</strong> Click the title. Ghost will explain what
        happened and what to do next. Items about &quot;behind schedule&quot; usually mean an
        automatic background task has not run - open Background Jobs and click Run now, or
        dismiss if you only sync tools yourself.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          ["Open", open.length],
          ["Critical", open.filter((x) => x.severity === "critical").length],
          ["Warning", open.filter((x) => x.severity === "warning").length],
          ["Acknowledged", open.filter((x) => x.status === "acknowledged").length],
          ["Snoozed", open.filter((x) => x.status === "snoozed").length],
          ["Assigned to me", open.filter((x) => x.assigned_user_id === ctx.user.id).length],
          [
            "Resolved recently",
            (all ?? []).filter(
              (x) =>
                x.status === "resolved" &&
                x.resolved_at &&
                new Date(x.resolved_at) >= recent,
            ).length,
          ],
        ].map(([label, n]) => (
          <div className="card" key={String(label)}>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-2xl font-bold">{n}</p>
          </div>
        ))}
      </div>

      <form className="card grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <input className="field" name="q" defaultValue={q} placeholder="Search" />
        <select className="field" name="status" defaultValue={status}>
          <option value="">Active attention</option>
          {notificationStatuses.map((x) => (
            <option key={x} value={x}>
              {titleCase(x)}
            </option>
          ))}
        </select>
        <select className="field" name="severity" defaultValue={severity}>
          <option value="">All severities</option>
          {notificationSeverities.map((x) => (
            <option key={x} value={x}>
              {titleCase(x)}
            </option>
          ))}
        </select>
        <select className="field" name="category" defaultValue={category}>
          <option value="">All categories</option>
          {notificationCategories.map((x) => (
            <option key={x} value={x}>
              {humanCategory(x)}
            </option>
          ))}
        </select>
        <select className="field" name="assignment" defaultValue={assignment}>
          <option value="">All assignments</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select className="field" name="rule" defaultValue={rule}>
          <option value="">All types</option>
          {rules.map((x) => (
            <option key={x} value={x}>
              {titleCase(String(x).replaceAll(".", " "))}
            </option>
          ))}
        </select>
        <input className="field" name="source" defaultValue={source} placeholder="Source type" />
        <select className="field" name="days" defaultValue={String(days)}>
          {[7, 30, 90, 365].map((x) => (
            <option key={x} value={x}>
              Last {x} days
            </option>
          ))}
        </select>
        <button className="button xl:col-span-8">Apply filters</button>
      </form>

      {!ordered.length ? (
        <div className="card text-zinc-500">
          {severity === "critical"
            ? "No critical issues detected"
            : Object.values(p).some(Boolean)
              ? "No notifications match these filters"
              : "No open actions. Nice work."}
        </div>
      ) : (
        <form action={notificationAction} className="space-y-3">
          <div className="card flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Bulk action
              <select className="field ml-2" name="action" required>
                <option value="">Choose</option>
                {canAcknowledge ? <option value="acknowledge">Acknowledge</option> : null}
                {canAssign ? <option value="assign">Assign</option> : null}
                {canAcknowledge ? <option value="snooze">Snooze</option> : null}
                {canResolve ? <option value="resolve">Resolve</option> : null}
                {canDismiss ? <option value="dismiss">Dismiss</option> : null}
              </select>
            </label>
            {canAssign ? (
              <select className="field" name="assignedUserId">
                <option value="">Select assignee</option>
                {(members ?? []).map((x) => (
                  <option key={x.user_id} value={x.user_id}>
                    {profileMap.get(x.user_id) ?? x.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : null}
            <input className="field" name="snoozedUntil" type="datetime-local" />
            <input
              className="field min-w-64 flex-1"
              name="reason"
              placeholder="Reason (required for resolve/dismiss)"
            />
            <button className="button">Apply to selected</button>
          </div>

          <div className="space-y-3">
            {ordered.map((item) => (
              <article className="card card-interactive" key={item.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    className="mt-1"
                    aria-label={`Select ${item.display.title}`}
                    name="ids"
                    type="checkbox"
                    value={item.id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge value={item.severity} />
                      <span className="badge badge-muted">{titleCase(item.status)}</span>
                      <span className="badge badge-muted">
                        {humanCategory(item.category)}
                      </span>
                    </div>
                    <Link
                      className="mt-2 block text-lg font-semibold hover:underline"
                      href={`/app/action-centre/${item.id}`}
                    >
                      {item.display.title}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-700">{item.display.summary}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-800">
                      What to do: {item.display.recommendedAction}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {item.assigned_user_id
                        ? `Assigned to ${profileMap.get(item.assigned_user_id) ?? "teammate"}`
                        : "Unassigned"}{" "}
                      · First seen {new Date(item.first_detected_at).toLocaleString()} ·{" "}
                      {counts.get(item.id) ?? 0} evidence item
                      {(counts.get(item.id) ?? 0) === 1 ? "" : "s"} ·{" "}
                      <Link className="underline" href={`/app/action-centre/${item.id}`}>
                        Open full details
                      </Link>
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </form>
      )}
    </section>
  );
}
