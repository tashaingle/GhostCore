import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {GoalBar} from "@/components/goals-card";
import {removeGoalAction, saveGoalAction} from "@/app/goal-actions";
import {loadGoals} from "@/lib/goals/load";
import {GOAL_METRICS, type GoalMetric} from "@/lib/goals/progress";

const CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "NZD"];

export default async function Goals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation(),
    p = await searchParams,
    canManage = hasPermission(ctx.membership.role as OrganisationRole, "goals.manage"),
    timeZone = ctx.organisation.timezone || "Europe/London",
    progress = await loadGoals(ctx.supabase, ctx.organisation.id, new Date(), timeZone),
    byMetric = new Map(progress.map((g) => [g.goal.metric, g]));
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app">
        ← Home
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Set a target for each month. Home shows how close you are, and from the middle of the
          month Metric Mage tells you if you&apos;re falling behind, with what it would take to
          catch up.
        </p>
      </div>
      <Notice searchParams={p} />
      {(Object.keys(GOAL_METRICS) as GoalMetric[]).map((metric) => {
        const meta = GOAL_METRICS[metric],
          current = byMetric.get(metric);
        return (
          <div key={metric} className="card space-y-4">
            <div>
              <h2 className="font-semibold">{`${meta.label} each month`}</h2>
              <p className="mt-1 text-sm text-zinc-500">{`Counts ${meta.sources}.`}</p>
            </div>
            {current ? <GoalBar progress={current} /> : null}
            {canManage ? (
              <div className="flex flex-wrap items-end gap-3">
                <form action={saveGoalAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="metric" value={metric} />
                  <label className="text-sm">
                    {meta.unit === "money" ? "Target a month" : "Orders a month"}
                    <input
                      className="field mt-1 block w-40"
                      name="target"
                      type="number"
                      min={1}
                      step={meta.unit === "money" ? "any" : 1}
                      inputMode="decimal"
                      placeholder={meta.unit === "money" ? "5000" : "100"}
                      defaultValue={current ? current.goal.target : undefined}
                      required
                    />
                  </label>
                  {meta.unit === "money" ? (
                    <label className="text-sm">
                      Currency
                      <select
                        className="field mt-1 block"
                        name="currency"
                        defaultValue={
                          current?.goal.currency ?? ctx.organisation.default_currency ?? "GBP"
                        }
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <SubmitButton pendingLabel="Saving…">
                    {current ? "Update goal" : "Set goal"}
                  </SubmitButton>
                </form>
                {current ? (
                  <form action={removeGoalAction}>
                    <input type="hidden" name="metric" value={metric} />
                    <button className="button button-secondary">Remove</button>
                  </form>
                ) : null}
              </div>
            ) : current ? null : (
              <p className="text-sm text-zinc-500">
                No goal set. An owner, admin or manager can add one.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
