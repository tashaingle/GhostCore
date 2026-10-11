/** Words people see for the codes stored on tasks and cases. */
const STATUS: Record<string, string> = {
  backlog: "Later",
  open: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  waiting: "Waiting on someone",
  completed: "Done",
  cancelled: "Cancelled",
  investigating: "Looking into it",
  resolved: "Resolved",
  closed: "Closed",
};
const PRIORITY: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Urgent",
};
const SOURCE: Record<string, string> = {
  manual: "Added by hand",
  notification: "From an alert",
  workflow: "From an automation",
  approval: "From an approval",
  correlation: "From linked events",
  integration: "From a connection",
  background_job: "From a background check",
  case: "From a case",
  template: "From a template",
  recurrence: "Repeating",
  system: "Added by Metric Mage",
};
const CATEGORY: Record<string, string> = {
  integration: "Connections",
  workflow: "Automations",
  deployment: "Website or app releases",
  data_quality: "Data problems",
  financial: "Money",
  security: "Security",
  organisation: "Organisation",
  provider: "A supplier or tool",
  operational: "Day-to-day running",
  custom: "Other",
};
const SLA: Record<string, string> = {
  none: "No deadline",
  healthy: "On track",
  warning: "Deadline soon",
  breached: "Deadline missed",
  paused: "Deadline paused",
  met: "Done on time",
};

const tidy = (code: string) => {
  const text = code.replaceAll("_", " ");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};
export const workStatusLabel = (code: string) => STATUS[code] ?? tidy(code);
export const workPriorityLabel = (code: string) => PRIORITY[code] ?? tidy(code);
export const workSourceLabel = (code: string | null | undefined) =>
  code ? (SOURCE[code] ?? tidy(code)) : "Added by hand";
export const caseCategoryLabel = (code: string) => CATEGORY[code] ?? tidy(code);
export const slaLabel = (code: string) => SLA[code] ?? tidy(code);
const COMMENT: Record<string, string> = {
  comment: "Comment",
  internal_note: "Note",
  status_note: "Status update",
  resolution_note: "How it was resolved",
};
export const commentLabel = (code: string) => COMMENT[code] ?? tidy(code);
