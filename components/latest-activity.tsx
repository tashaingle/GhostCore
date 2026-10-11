import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {ProviderMark} from "@/components/home-ui";
import {providerLabel} from "@/lib/ui/labels";
import {timeAgo} from "@/lib/home/connections";

export type ActivityRow = {
  id: string;
  source: string;
  title: string;
  severity: string;
  occurred_at: string;
};

/** Status dot and words; colour is backed by a label, never colour alone. */
const STATUS: Record<string, {label: string; dot: string; text: string}> = {
  critical: {label: "Problem", dot: "bg-rose-500", text: "text-rose-700"},
  warning: {label: "Needs a look", dot: "bg-amber-500", text: "text-amber-700"},
  good: {label: "Good news", dot: "bg-emerald-500", text: "text-emerald-700"},
  info: {label: "Update", dot: "bg-sky-500", text: "text-zinc-600"},
};

/** The last few things that happened across the connected tools, as a compact table. */
export function LatestActivity({rows, now}: {rows: ActivityRow[]; now: Date}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-zinc-950">Latest activity</h2>
        <Link
          href="/app/timeline"
          className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
        >
          Timeline
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
      {rows.length ? (
        <div className="-mx-2 mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-400">
                <th className="px-2 py-2 font-medium">Tool</th>
                <th className="px-2 py-2 font-medium">What happened</th>
                <th className="px-2 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = STATUS[row.severity] ?? STATUS.info;
                return (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-2.5 whitespace-nowrap font-medium text-zinc-800">
                        <ProviderMark provider={row.source} size="sm" />
                        {providerLabel(row.source)}
                      </span>
                    </td>
                    <td
                      className="max-w-[320px] truncate px-2 py-3 text-zinc-700"
                      title={row.title}
                    >
                      {row.title}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-zinc-500">
                      {timeAgo(row.occurred_at, now)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${status.text}`}
                      >
                        <span aria-hidden className={`h-2 w-2 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing yet. New activity from your tools will appear here as it comes in.
        </p>
      )}
    </section>
  );
}
