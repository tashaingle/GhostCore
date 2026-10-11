import type {StepInput, WorkflowStepType} from "./types";

/** What each kind of step does, in words people use. */
export const STEP_TYPES: Record<WorkflowStepType, {label: string; hint: string}> = {
  task: {
    label: "Give someone a task",
    hint: "Adds a task to Work for the person or role you pick.",
  },
  approval: {
    label: "Ask for approval",
    hint: "Waits until someone says yes before the next step runs.",
  },
  manual_confirmation: {
    label: "Ask someone to confirm",
    hint: "Waits until someone ticks it off as done.",
  },
  notification: {
    label: "Raise an alert",
    hint: "Adds an item to the Action Centre (and emails anyone who's chosen alert emails).",
  },
  delay: {label: "Wait", hint: "Pauses before the next step."},
  background_job: {
    label: "Run a check",
    hint: "Runs one of Metric Mage's own background checks, like re-checking a connection.",
  },
  integration_action: {
    label: "Re-sync a tool",
    hint: "Fetches the latest data from a connected tool. It never changes anything in the tool.",
  },
  condition: {
    label: "Only continue if…",
    hint: "Checks something about what started the automation, and skips ahead if it doesn't match.",
  },
  webhook: {label: "Send to another app", hint: "Sends the details to a web address you choose."},
  complete: {label: "Finish", hint: "Marks the automation as done."},
};

export const ROLE_OPTIONS = [
  {value: "", label: "Anyone on the team"},
  {value: "owner", label: "An owner"},
  {value: "admin", label: "An admin"},
  {value: "manager", label: "A manager"},
  {value: "member", label: "A member"},
];

const who = (role: string | null | undefined) =>
  (ROLE_OPTIONS.find((r) => r.value === (role ?? ""))?.label ?? `a ${role}`).replace(/^A/, "a");
const hours = (h: unknown) => {
  const n = Number(h ?? 24);
  return n % 24 === 0 && n >= 24
    ? `${n / 24} day${n === 24 ? "" : "s"}`
    : `${n} hour${n === 1 ? "" : "s"}`;
};

/** One plain sentence for a step, like "Give a manager a task, due within 4 hours". */
export function describeStep(step: Pick<StepInput, "type" | "configuration" | "assignedRole">) {
  const c = step.configuration ?? {},
    person = step.assignedRole ? who(step.assignedRole) : "someone on the team";
  switch (step.type) {
    case "task":
      return `Give ${person} a task, due within ${hours(c.dueHours)}`;
    case "approval":
      return `Ask ${person} to approve, within ${hours(c.dueHours)}`;
    case "manual_confirmation":
      return `Ask ${person} to confirm it's done`;
    case "notification":
      return "Raise an alert in the Action Centre";
    case "delay": {
      const s = Number(c.seconds ?? 60);
      return `Wait ${s >= 3600 ? hours(s / 3600) : `${Math.max(1, Math.round(s / 60))} minute${Math.round(s / 60) === 1 ? "" : "s"}`}`;
    }
    case "background_job":
      return c.jobKey === "integration.health"
        ? "Check the connection is working"
        : c.jobKeyFromTrigger
          ? "Run the failed task again"
          : "Run a background check";
    case "integration_action":
      return `Re-sync ${typeof c.provider === "string" && c.provider ? providerName(c.provider) : "the tool"}`;
    case "condition":
      return "Only continue if the details match";
    case "webhook":
      return "Send the details to another app";
    case "complete":
      return "Finish";
  }
}

const providerName = (p: string) =>
  ({github: "GitHub", google_analytics: "Google Analytics", meta_ads: "Meta Ads"})[p] ??
  p[0].toUpperCase() + p.slice(1).replaceAll("_", " ");

const RUN_STATUS: Record<string, string> = {
  queued: "Starting",
  running: "Running",
  waiting: "Waiting for someone",
  paused: "Paused",
  completed: "Finished",
  failed: "Stopped with a problem",
  cancelled: "Cancelled",
  skipped: "Skipped",
  pending: "Waiting",
  approved: "Approved",
  rejected: "Turned down",
  expired: "Expired",
};
/** Plain words for where an automation run, step, approval or task has got to. */
export const runStatusLabel = (status: string) => RUN_STATUS[status] ?? status.replaceAll("_", " ");
