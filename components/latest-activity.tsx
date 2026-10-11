import Link from "next/link";
import {ArrowRight, ArrowUpRight} from "lucide-react";
import {ProviderMark} from "@/components/home-ui";
import {providerLabel} from "@/lib/ui/labels";
import {timeAgo} from "@/lib/home/connections";
import {explainEvent} from "@/lib/events/explain";

export type ActivityRow = {
  id: string;
  source: string;
  event_type: string;
  title: string;
  description: string | null;
  severity: string;
  occurred_at: string;
  metadata: unknown;
};

/** Status dot and words; colour is backed by a label, never colour alone. */
const STATUS: Record<string, {label: string; dot: string; text: string}> = {
  critical: {label: "Problem", dot: "bg-rose-500", text: "text-rose-700"},
  warning: {label: "Needs a look", dot: "bg-amber-500", text: "text-amber-700"},
  good: {label: "Good news", dot: "bg-emerald-500", text: "text-emerald-700"},
  info: {label: "Update", dot: "bg-sky-500", text: "text-zinc-600"},
};

/** The last few things that happened across the connected tools, explained, with what to do. */
export function LatestActivity({rows, now}: {rows: ActivityRow[]; now: Date}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-zinc-950">Latest activity</h2>
        <Link
          href="/app/timeline"
          className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
        >
          See everything
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-zinc-100">
          {rows.map((row) => {
            const explained = explainEvent(row),
              status = STATUS[explained.status] ?? STATUS.info;
            return (
              <li key={row.id} className="flex gap-3 py-3.5">
                <ProviderMark provider={row.source} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-medium text-zinc-900">{explained.title}</p>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${status.text}`}
                    >
                      <span aria-hidden className={`h-2 w-2 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                  {explained.detail ? (
                    <p className="mt-0.5 text-sm text-zinc-600">{explained.detail}</p>
                  ) : null}
                  {explained.advice ? (
                    <div className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
                      <span className="font-semibold">What to do: </span>
                      {explained.advice}
                      {explained.action ? (
                        <a
                          className="mt-1.5 flex w-fit items-center gap-1 font-medium text-violet-700 hover:underline"
                          href={explained.action.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {explained.action.label}
                          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-400">
                    {`${providerLabel(row.source)} · ${timeAgo(row.occurred_at, now)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing yet. New activity from your tools will appear here as it comes in.
        </p>
      )}
    </section>
  );
}
