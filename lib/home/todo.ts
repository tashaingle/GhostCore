export const TODO_CHOICES = [
  {value: "open", label: "Not started", colour: "#c4c4c4"},
  {value: "in_progress", label: "In progress", colour: "#fdab3d"},
  {value: "completed", label: "Done", colour: "#00c875"},
] as const;

export type TodoChoice = (typeof TODO_CHOICES)[number]["value"];

/** The three statuses on the shared to-do list. */
export function assigneeIds(
  taskId: string,
  fallbackUserId: string | null,
  rows: {task_id: string | null; assigned_user_id: string | null}[],
) {
  const chosen = rows.flatMap((row) =>
    row.task_id === taskId && row.assigned_user_id ? [row.assigned_user_id] : [],
  );
  return [...new Set(chosen.length ? chosen : fallbackUserId ? [fallbackUserId] : [])];
}

export function todoChoice(status: string): TodoChoice {
  if (status === "completed" || status === "cancelled") return "completed";
  if (status === "in_progress" || status === "blocked") return "in_progress";
  return "open";
}
