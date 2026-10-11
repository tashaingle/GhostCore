import {DATE} from "@/lib/ui/dates";
import {workSourceLabel} from "@/lib/ui/work-labels";
import Link from "next/link";
import {WorkStatus} from "./work-status";
import {sortUnifiedWork} from "@/lib/work/status";
import type {UnifiedWork} from "@/lib/work/types";
type Item = UnifiedWork & {
  assignee: string | null;
  owner: string | null;
  caseNumber?: string | null;
  sourceType: string;
  checklist?: string;
  blockers?: number;
  watchers?: number;
  updatedAt: string;
};
export function WorkList({items}: {items: Item[]}) {
  const sorted = sortUnifiedWork(items) as Item[];
  if (!sorted.length)
    return (
      <div className="card text-zinc-500">Nothing here. Create a task, or try another tab.</div>
    );
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-zinc-500">
            <th className="p-3 font-medium">What</th>
            <th className="font-medium">Status</th>
            <th className="font-medium">Due</th>
            <th className="font-medium">Who</th>
            <th className="pr-3 font-medium">Where it came from</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((x) => (
            <tr className="border-b align-top" key={`${x.kind}:${x.id}`}>
              <td className="p-3">
                <Link
                  className="font-semibold hover:underline"
                  href={`/app/${x.kind === "task" ? "tasks" : "cases"}/${x.id}`}
                >
                  {x.kind === "case" && x.caseNumber ? (
                    <span className="mr-2 text-zinc-500">{x.caseNumber}</span>
                  ) : null}
                  {x.title}
                </Link>
                <p className="text-xs text-zinc-500">
                  {x.kind === "case" ? "Case" : "Task"}
                  {x.checklist ? ` · ${x.checklist}` : ""}
                </p>
              </td>
              <td className="py-3 pr-3">
                <WorkStatus status={x.status} priority={x.priority} />
              </td>
              <td className="whitespace-nowrap py-3 pr-3">
                {x.dueAt ? (
                  <time dateTime={x.dueAt}>{new Date(x.dueAt).toLocaleString("en-GB", DATE)}</time>
                ) : (
                  <span className="text-zinc-400">No date</span>
                )}
              </td>
              <td className="py-3">
                {x.assignee ?? <span className="text-zinc-400">No one yet</span>}
              </td>
              <td className="py-3 pr-3 text-zinc-600">{workSourceLabel(x.sourceType)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
