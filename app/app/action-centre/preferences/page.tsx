import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {saveNotificationPreference} from "@/app/notification-actions";
import {notificationCategories} from "@/lib/notifications/types";
import {setWeeklySummary} from "@/app/weekly-summary-actions";
import {SubmitButton} from "@/components/submit-button";
export default async function Preferences({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    {data: rows} = await ctx.supabase
      .from("notification_preferences")
      .select("*")
      .eq("organisation_id", ctx.organisation.id),
    canOrg = hasPermission(ctx.membership.role as OrganisationRole, "notifications.rules.manage"),
    user = rows?.find((x) => x.user_id === ctx.user.id && !x.category),
    org = rows?.find((x) => !x.user_id && !x.category),
    {data: optOut} = await ctx.supabase
      .from("weekly_summary_opt_outs")
      .select("user_id")
      .eq("organisation_id", ctx.organisation.id)
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
    weekly = !optOut;
  const form = (scope: "user" | "organisation", current: typeof user) => (
    <form action={saveNotificationPreference} className="card grid gap-3 md:grid-cols-2">
      <input type="hidden" name="scope" value={scope} />
      <h3 className="font-semibold md:col-span-2">
        {scope === "user" ? "My preferences" : "Organisation defaults"}
      </h3>
      <label>
        Category
        <select className="field ml-2" name="category">
          <option value="">All categories</option>
          {notificationCategories.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        Minimum severity
        <select
          className="field ml-2"
          name="minimumSeverity"
          defaultValue={current?.minimum_severity ?? "info"}
        >
          {["info", "warning", "critical"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      {[
        ["inApp", "In-app enabled", current?.in_app_enabled ?? true],
        [
          "assignment",
          "Assignment-related (includes approval request emails)",
          current?.assignment_enabled ?? true,
        ],
        ["email", "Email me alerts (immediate digest mode only)", current?.email_enabled ?? false],
        ["webhook", "Webhooks (coming soon)", current?.webhook_enabled ?? false],
      ].map(([name, label, checked]) => (
        <label className="flex gap-2" key={String(name)}>
          <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />
          {label}
        </label>
      ))}
      <label>
        Digest
        <select
          className="field ml-2"
          name="digestMode"
          defaultValue={current?.digest_mode ?? "immediate"}
        >
          {["immediate", "daily", "weekly", "off"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <button className="button md:col-span-2">Save preferences</button>
    </form>
  );
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/action-centre">
        ← Action Centre
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Notification preferences
        </h1>
        <p className="mt-2 text-base text-zinc-500">
          Choose which alerts you hear about. Your own settings override the organisation&apos;s
          defaults, and a few essential alerts are always shown.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Alerts always appear in the Action Centre. Turn on email below to get them by email too;
          webhooks aren&apos;t available yet.
        </p>
      </div>
      <Notice searchParams={p} />
      <form
        action={setWeeklySummary}
        className="card flex flex-wrap items-center justify-between gap-4"
      >
        <input type="hidden" name="on" value={weekly ? "false" : "true"} />
        <div>
          <h3 className="font-semibold">Monday summary email</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {weekly
              ? `Every Monday morning: how ${ctx.organisation.name}'s week went, what's going well and what needs a look.`
              : `Off. Turn it on to get a short summary of ${ctx.organisation.name}'s week every Monday morning.`}
          </p>
        </div>
        <SubmitButton
          className={weekly ? "button button-secondary" : "button"}
          pendingLabel="Saving…"
        >
          {weekly ? "Turn off" : "Turn on"}
        </SubmitButton>
      </form>
      {form("user", user)}
      {canOrg && form("organisation", org)}
    </section>
  );
}
