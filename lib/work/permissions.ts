import {workStatusLabel} from "@/lib/ui/work-labels";

/** The permission needed to move a task or case to a status, or to (un)assign it. */
export function workPermission(kind: "task" | "case", action: string) {
  if (action === "assign" || action === "unassign") return "work.assign" as const;
  if (action === "cancelled") return "work.cancel" as const;
  // Anyone who can finish work can also start it.
  if (kind === "task" && (action === "completed" || action === "in_progress"))
    return "work.complete" as const;
  if (kind === "case" && (action === "resolved" || action === "closed"))
    return "cases.resolve" as const;
  return "work.manage" as const;
}

export function workSavedMessage(kind: "task" | "case", action: string) {
  if (action === "assign") return "Assigned.";
  if (action === "unassign") return "Assignee removed.";
  if (action === "completed") return "Marked as done.";
  if (action === "cancelled") return `${kind === "task" ? "Task" : "Case"} cancelled.`;
  return `Moved to "${workStatusLabel(action)}".`;
}
