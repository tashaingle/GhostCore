import Link from "next/link";
import {Target} from "lucide-react";
import {GOAL_STATUS_LABEL, type GoalProgress, type GoalStatus} from "@/lib/goals/progress";

const STATUS: Record<GoalStatus, {bar: string; pill: string}> = {
  done: {bar: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-800"},
  on_track: {bar: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-800"},
  close: {bar: "bg-amber-500", pill: "bg-amber-100 text-amber-900"},
  behind: {bar: "bg-rose-500", pill: "bg-rose-100 text-rose-800"},
  early: {bar: "bg-sky-500", pill: "bg-zinc-100 text-zinc-600"},
};

/** One goal: how far along, where an even pace would be, and whether it's on track. */
export function GoalBar({progress}: {progress: GoalProgress}) {
  const s = STATUS[progress.status],
    pct = (n: number) => `${Math.min(100, Math.max(0, n * 100)).toFixed(1)}%`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-zinc-900">{`${progress.label} for ${progress.monthName}`}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.pill}`}>
          {GOAL_STATUS_LABEL[progress.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-700">
        {progress.valueText}
        {progress.testMode ? <span className="text-zinc-400"> · Stripe test mode</span> : null}
      </p>
      <div
        className="relative mt-2 h-2.5 rounded-full bg-zinc-200/80"
        role="progressbar"
        aria-label={`${progress.label} goal`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, progress.reached) * 100)}
      >
        <div className={`h-full rounded-full ${s.bar}`} style={{width: pct(progress.reached)}} />
        {progress.status !== "done" ? (
          <div
            className="absolute -top-1 h-[18px] w-0.5 rounded bg-zinc-500"
            style={{left: pct(progress.elapsed)}}
            title="Where an even pace would be today"
          />
        ) : null}
      </div>
      <p className="mt-2 text-sm text-zinc-500">{progress.summary}</p>
    </div>
  );
}

/** Goals on Home. Offers to set one when there are none and the person is allowed to. */
export function GoalsCard({goals, canManage}: {goals: GoalProgress[]; canManage: boolean}) {
  if (!goals.length && !canManage) return null;
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-zinc-200/60">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-zinc-950">
          <Target aria-hidden className="h-[18px] w-[18px]" />
          Goals
        </h2>
        {canManage && goals.length ? (
          <Link href="/app/goals" className="text-sm font-medium text-zinc-500 hover:underline">
            Change
          </Link>
        ) : null}
      </div>
      {goals.length ? (
        <div className="mt-4 space-y-5">
          {goals.map((g) => (
            <GoalBar key={g.goal.id} progress={g} />
          ))}
          {goals.some((g) => g.status !== "done") ? (
            <p className="text-xs text-zinc-400">
              The line on each bar shows where you&apos;d be today at an even pace.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-500">
          <p>
            Set a monthly target, like £5,000 in revenue, and Metric Mage will show how close you
            are and tell you if you&apos;re falling behind.
          </p>
          <Link href="/app/goals" className="button mt-3 inline-block">
            Set a goal
          </Link>
        </div>
      )}
    </section>
  );
}
