import {workPriorityLabel, workStatusLabel} from "@/lib/ui/work-labels";

export function WorkStatus({status, priority}: {status: string; priority: string}) {
  const urgent = priority === "high" || priority === "critical";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-xs">
      {workStatusLabel(status)}
      {priority !== "normal" ? (
        <span className={urgent ? "font-medium text-rose-700" : "text-zinc-500"}>
          {`· ${workPriorityLabel(priority)} priority`}
        </span>
      ) : null}
    </span>
  );
}
