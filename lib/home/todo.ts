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

/** Deadlines are whole days. They're stored at midday UTC so the day never shifts. */
export function dueAtFromDay(day: string) {
  return `${day}T12:00:00.000Z`;
}

export function dayFromDueAt(dueAt: string | null) {
  return dueAt ? dueAt.slice(0, 10) : "";
}

/** Today's date as YYYY-MM-DD, in UK time. */
export function todayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", {timeZone: "Europe/London"});
}

export type DueTone = "overdue" | "soon" | "later" | "done";

/** "Overdue · 28 Oct", "Due today", "Due tomorrow", "Due Fri 6 Nov". */
export function dueLabel(dueAt: string, status: string, today = todayKey()) {
  const day = dayFromDueAt(dueAt);
  const days = Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);
  const date = new Date(dueAtFromDay(day)).toLocaleDateString("en-GB", {
    weekday: Math.abs(days) < 7 ? "short" : undefined,
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (todoChoice(status) === "completed") return {text: `Due ${date}`, tone: "done" as DueTone};
  if (days < 0) return {text: `Overdue · ${date}`, tone: "overdue" as DueTone};
  if (days === 0) return {text: "Due today", tone: "soon" as DueTone};
  if (days === 1) return {text: "Due tomorrow", tone: "soon" as DueTone};
  return {text: `Due ${date}`, tone: (days <= 3 ? "soon" : "later") as DueTone};
}
