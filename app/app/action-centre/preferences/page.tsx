import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {saveNotificationPreference} from "@/app/notification-actions";
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
  const LEVELS = [
    {
      value: "critical",
      label: "Only problems",
      hint: "Things that are broken, like a failed payment or a tool that stopped syncing.",
    },
    {
      value: "warning",
      label: "Problems and things worth a look",
      hint: "Also drops worth checking, like refunds climbing or traffic falling.",
    },
    {value: "info", label: "Everything", hint: "Also general updates. This can be a lot of email."},
  ];
  const form = (scope: "user" | "organisation", current: typeof user) => {
    const level = current?.minimum_severity ?? "warning",
      name = (field: string) => `${scope}-${field}`;
    return (
      <form action={saveNotificationPreference} className="card space-y-5">
        <input type="hidden" name="scope" value={scope} />
        <div>
          <h2 className="font-semibold">{scope === "user" ? "Alert emails" : "Team default"}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {scope === "user"
              ? "When Metric Mage spots something, it adds an alert to your Action Centre. You can also get an email as soon as it happens."
              : "Used for anyone on the team who hasn't chosen their own settings above. Only owners and admins can change this."}
          </p>
        </div>
        <label className="flex items-start gap-3">
          <input
            id={name("email")}
            name="email"
            type="checkbox"
            className="mt-1"
            defaultChecked={
              (current?.email_enabled ?? false) &&
              (current?.digest_mode ?? "immediate") === "immediate"
            }
          />
          <span>
            <span className="font-medium text-zinc-900">
              Email me when there&apos;s a new alert
            </span>
            <span className="block text-sm text-zinc-500">
              Sent to the address you sign in with.
            </span>
          </span>
        </label>
        <fieldset>
          <legend className="font-medium text-zinc-900">Which alerts?</legend>
          <div className="mt-2 space-y-2">
            {LEVELS.map((l) => (
              <label key={l.value} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="minimumSeverity"
                  value={l.value}
                  className="mt-1"
                  defaultChecked={level === l.value}
                />
                <span>
                  <span className="text-zinc-900">{l.label}</span>
                  <span className="block text-sm text-zinc-500">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-3">
          <input
            name="assignment"
            type="checkbox"
            className="mt-1"
            defaultChecked={current?.assignment_enabled ?? true}
          />
          <span>
            <span className="font-medium text-zinc-900">
              Email me when someone asks me to approve something
            </span>
            <span className="block text-sm text-zinc-500">
              For example, an automation waiting for a yes or no before it runs.
            </span>
          </span>
        </label>
        <SubmitButton className="button" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>
    );
  };
  return (
    <section className="space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/action-centre">
        ← Action Centre
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Email settings</h1>
        <p className="mt-2 text-base text-zinc-500">
          {`Choose which emails you get about ${ctx.organisation.name}. Every alert still shows in the Action Centre, whatever you pick here.`}
        </p>
      </div>
      <Notice searchParams={p} />
      <form
        action={setWeeklySummary}
        className="card flex flex-wrap items-center justify-between gap-4"
      >
        <input type="hidden" name="on" value={weekly ? "false" : "true"} />
        <div>
          <h2 className="font-semibold">Monday summary email</h2>
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
