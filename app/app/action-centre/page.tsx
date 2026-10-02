import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {SeverityLabel} from "@/components/home-ui";
import {timeAgo} from "@/lib/home/connections";
import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  ListFilter,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import {notificationAction, evaluateNotificationsAction} from "@/app/notification-actions";
import {
  notificationCategories,
  notificationSeverities,
  notificationStatuses,
} from "@/lib/notifications/types";
import {sortNotifications} from "@/lib/notifications/status";
import {humanCategory, humanizeNotificationDisplay, titleCase} from "@/lib/ui/labels";

const SYSTEM_CATEGORY = "background_job";

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
  // Ghost's own background-task alerts are hidden unless asked for or filtered to explicitly.
  const showSystem = value("show") === "system" || category === SYSTEM_CATEGORY;
  const now = new Date();

  let query = ctx.supabase
    .from("notifications")
    .select("*")
    .eq("organisation_id", ctx.organisation.id)
    .gte("last_detected_at", new Date(now.getTime() - days * 86400000).toISOString())
    .order("last_detected_at", {ascending: false})
    .limit(200);

  if (status) query = query.eq("status", status);
  // "Active attention": open or acknowledged, plus snoozed items whose snooze has ended.
  else
    query = query.or(
      `status.in.(open,acknowledged),and(status.eq.snoozed,snoozed_until.lte.${now.toISOString()})`,
    );
  if (severity) query = query.eq("severity", severity);
  if (category) query = query.eq("category", category);
  else if (!showSystem) query = query.neq("category", SYSTEM_CATEGORY);
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
    {data: members},
    {data: profiles},
    {data: jobs},
    {data: integrations},
  ] = await Promise.all([
    query,
    ctx.supabase
      .from("notifications")
      .select("id,status,severity,category,assigned_user_id,resolved_at,rule_key")
      .eq("organisation_id", ctx.organisation.id)
      .limit(1000),
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

  const profileMap = new Map((profiles ?? []).map((x) => [x.id, x.full_name ?? x.id.slice(0, 8)]));
  const jobById = new Map(
    (jobs ?? []).map((j) => [j.id, {job_key: j.job_key, provider: j.provider}]),
  );
  const integrationById = new Map(
    (integrations ?? []).map((i) => [i.id, {provider: i.provider, name: i.provider_account_name}]),
  );

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

  const allOpen = (all ?? []).filter((x) => ["open", "acknowledged", "snoozed"].includes(x.status)),
    systemOpen = allOpen.filter((x) => x.category === SYSTEM_CATEGORY).length,
    // Summary counts match what the list shows.
    open = showSystem ? allOpen : allOpen.filter((x) => x.category !== SYSTEM_CATEGORY);
  const recent = new Date(now.getTime() - 7 * 86400000);
  const role = ctx.membership.role as OrganisationRole;
  const canAcknowledge = hasPermission(role, "notifications.acknowledge");
  const canResolve = hasPermission(role, "notifications.resolve");
  const canDismiss = hasPermission(role, "notifications.dismiss");
  const canAssign = hasPermission(role, "notifications.assign");
  const canEvaluate = hasPermission(role, "notifications.rules.manage");
  const rules = [...new Set((rows ?? []).map((x) => x.rule_key).filter(Boolean))];

  const keep = showSystem ? "&show=system" : "";
  const views = [
    {
      key: "attention",
      label: "Needs attention",
      href: showSystem ? "/app/action-centre?show=system" : "/app/action-centre",
      count: open.length,
    },
    {
      key: "urgent",
      label: "Urgent",
      href: `/app/action-centre?severity=critical${keep}`,
      count: open.filter((x) => x.severity === "critical").length,
    },
    {
      key: "mine",
      label: "Assigned to me",
      href: `/app/action-centre?assignment=me${keep}`,
      count: open.filter((x) => x.assigned_user_id === ctx.user.id).length,
    },
    {
      key: "resolved",
      label: "Resolved this week",
      href: `/app/action-centre?status=resolved${keep}`,
      count: (all ?? []).filter(
        (x) => x.status === "resolved" && x.resolved_at && new Date(x.resolved_at) >= recent,
      ).length,
    },
  ];
  const activeView =
    status === "resolved"
      ? "resolved"
      : assignment === "me"
        ? "mine"
        : severity === "critical"
          ? "urgent"
          : "attention";
  // Filters beyond what the tabs already express.
  const extraFilters = [
    q,
    category,
    rule,
    source,
    days !== 30 ? "days" : "",
    status && status !== "resolved" ? status : "",
    severity && severity !== "critical" ? severity : "",
    assignment && assignment !== "me" ? assignment : "",
  ].filter(Boolean).length;
  const quietButton =
    "inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-950";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Action Centre</h1>
          <p className="mt-2 max-w-2xl text-base text-zinc-500">
            Things Ghost needs a person to check, fix or dismiss. Click any item for a full
            explanation.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link className={quietButton} href="/app/action-centre/preferences">
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
            Preferences
          </Link>
          {canEvaluate ? (
            <form action={evaluateNotificationsAction}>
              <button className={quietButton}>
                <RefreshCw aria-hidden className="h-4 w-4" />
                Refresh
              </button>
            </form>
          ) : null}
        </div>
      </header>
      <Notice searchParams={p} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Action Centre views"
          className="flex flex-wrap gap-1 rounded-xl bg-zinc-200/60 p-1"
        >
          {views.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              aria-current={v.key === activeView ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                v.key === activeView
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {v.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  v.key === activeView
                    ? "bg-zinc-100 text-zinc-700"
                    : "bg-zinc-300/60 text-zinc-600"
                }`}
              >
                {v.count}
              </span>
            </Link>
          ))}
        </nav>
        {showSystem ? (
          <Link
            className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
            href="/app/action-centre"
          >
            Hide system alerts
          </Link>
        ) : systemOpen ? (
          <Link
            className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
            href="/app/action-centre?show=system"
            title="Alerts about Ghost's own background tasks running late or retrying. They usually fix themselves."
          >
            Show {systemOpen} system alert{systemOpen === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>

      <details className="group/filters" open={extraFilters > 0 || undefined}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
          <ListFilter aria-hidden className="h-4 w-4" />
          Filter
          {extraFilters ? (
            <span className="rounded-full bg-violet-100 px-1.5 text-xs text-violet-700">
              {extraFilters}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className="h-4 w-4 transition-transform group-open/filters:rotate-180"
          />
        </summary>
        <form className="mt-3 grid gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          {showSystem ? <input type="hidden" name="show" value="system" /> : null}
          {source ? <input type="hidden" name="source" value={source} /> : null}
          <label className="label sm:col-span-2">
            Search
            <input
              className="field"
              name="q"
              defaultValue={q}
              placeholder="Words in the title or summary"
            />
          </label>
          <label className="label">
            Status
            <select className="field" name="status" defaultValue={status}>
              <option value="">Needs attention</option>
              {notificationStatuses.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Importance
            <select className="field" name="severity" defaultValue={severity}>
              <option value="">Any</option>
              {notificationSeverities.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Category
            <select className="field" name="category" defaultValue={category}>
              <option value="">Any</option>
              {notificationCategories.map((x) => (
                <option key={x} value={x}>
                  {humanCategory(x)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Assigned
            <select className="field" name="assignment" defaultValue={assignment}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Nobody yet</option>
            </select>
          </label>
          <label className="label">
            Type
            <select className="field" name="rule" defaultValue={rule}>
              <option value="">Any</option>
              {rules.map((x) => (
                <option key={x} value={x}>
                  {titleCase(String(x).replaceAll(".", " "))}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Period
            <select className="field" name="days" defaultValue={String(days)}>
              {[7, 30, 90, 365].map((x) => (
                <option key={x} value={x}>
                  Last {x} days
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="button">Apply</button>
            {extraFilters ? (
              <Link className="button button-ghost" href={views[0].href}>
                Clear filters
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      {!ordered.length ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-14 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CircleCheck aria-hidden className="h-5 w-5" />
          </span>
          <p className="mt-3 font-medium text-zinc-900">
            {activeView === "attention" && !extraFilters
              ? "You're all caught up"
              : "Nothing matches this view"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {activeView === "attention" && !extraFilters
              ? "New alerts will appear here when Ghost spots something."
              : "Try another tab or clear your filters."}
          </p>
        </div>
      ) : (
        <form action={notificationAction} className="group/bulk">
          <ul className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03]">
            {ordered.map((item) => (
              <li
                key={item.id}
                className="flex gap-4 border-b border-zinc-100 px-5 py-4 transition-colors last:border-0 hover:bg-zinc-50/70 has-[.bulk-select:checked]:bg-violet-50/60"
              >
                <input
                  className="bulk-select mt-1.5 h-4 w-4 shrink-0 accent-violet-600"
                  aria-label={`Select ${item.display.title}`}
                  name="ids"
                  type="checkbox"
                  value={item.id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <SeverityLabel severity={item.severity} />
                    <span className="text-xs text-zinc-400">{humanCategory(item.category)}</span>
                    {item.status !== "open" ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {titleCase(item.status)}
                      </span>
                    ) : null}
                  </div>
                  <Link
                    className="mt-1.5 block font-semibold text-zinc-950 hover:underline"
                    href={`/app/action-centre/${item.id}`}
                  >
                    {item.display.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-zinc-600">{item.display.summary}</p>
                  {item.display.recommendedAction ? (
                    <p className="mt-2 text-sm text-zinc-800">
                      <span className="font-medium">What to do:</span>{" "}
                      {item.display.recommendedAction}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-400">
                    {item.assigned_user_id
                      ? `Assigned to ${profileMap.get(item.assigned_user_id) ?? "a teammate"}`
                      : "Not assigned"}{" "}
                    · First seen {timeAgo(item.first_detected_at, now)}
                    {item.occurrence_count > 1 ? ` · Seen ${item.occurrence_count} times` : ""}
                  </p>
                </div>
                <Link
                  href={`/app/action-centre/${item.id}`}
                  aria-label={`Open ${item.display.title}`}
                  className="hidden self-center text-zinc-300 transition-colors hover:text-zinc-600 sm:block"
                >
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Only shown once at least one item is ticked; stays in view while scrolling. */}
          <div className="sticky bottom-4 z-10 mt-4 hidden flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg shadow-zinc-900/10 backdrop-blur group-has-[.bulk-select:checked]/bulk:flex">
            <select
              className="field w-auto"
              name="action"
              required
              aria-label="Action for selected items"
            >
              <option value="">Choose an action…</option>
              {canAcknowledge ? <option value="acknowledge">Acknowledge</option> : null}
              {canAssign ? <option value="assign">Assign to…</option> : null}
              {canAcknowledge ? <option value="snooze">Snooze until…</option> : null}
              {canResolve ? <option value="resolve">Resolve</option> : null}
              {canDismiss ? <option value="dismiss">Dismiss</option> : null}
            </select>
            {canAssign ? (
              <select className="field w-auto" name="assignedUserId" aria-label="Assign to">
                <option value="">Assign to (if assigning)</option>
                {(members ?? []).map((x) => (
                  <option key={x.user_id} value={x.user_id}>
                    {profileMap.get(x.user_id) ?? x.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              className="field w-auto"
              name="snoozedUntil"
              type="datetime-local"
              aria-label="Snooze until (if snoozing)"
              title="Snooze until (if snoozing)"
            />
            <input
              className="field min-w-48 flex-1"
              name="reason"
              placeholder="Reason (needed to resolve or dismiss)"
            />
            <button className="button">Apply to selected</button>
          </div>
        </form>
      )}
    </div>
  );
}
