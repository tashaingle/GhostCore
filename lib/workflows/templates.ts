import type {WorkflowDefinitionInput} from "./types";
export type WorkflowTemplate = {
  key: string;
  name: string;
  description: string;
  definition: WorkflowDefinitionInput;
};
export const workflowTemplates: WorkflowTemplate[] = [
  {
    key: "deployment_failure",
    name: "Deployment failure review",
    description:
      "When a GitHub build fails: assign someone to look into it, ask an owner to approve, then re-sync GitHub.",
    definition: {
      name: "Deployment failure review",
      description: "Recover from a failed deployment, with an owner's approval.",
      triggerType: "notification.created",
      steps: [
        {
          name: "Assign someone to investigate",
          type: "task",
          assignedRole: "manager",
          configuration: {dueHours: 4},
        },
        {
          name: "Ask an owner to approve",
          type: "approval",
          assignedRole: "owner",
          configuration: {dueHours: 8},
        },
        {
          name: "Re-sync GitHub",
          type: "integration_action",
          configuration: {action: "sync", provider: "github"},
        },
        {name: "Complete", type: "complete", configuration: {}},
      ],
    },
  },
  {
    key: "integration_reconnect",
    name: "Connection fixed",
    description: "When a connection is fixed: confirm the right account, then check it's working.",
    definition: {
      name: "Connection fixed",
      description: "Check a reconnected tool is working.",
      triggerType: "integration.reconnected",
      steps: [
        {
          name: "Confirm the right account is connected",
          type: "manual_confirmation",
          assignedRole: "admin",
          configuration: {},
        },
        {
          name: "Check the connection",
          type: "background_job",
          configuration: {jobKey: "integration.health"},
        },
        {name: "Complete", type: "complete", configuration: {}},
      ],
    },
  },
  {
    key: "csv_import_review",
    name: "Spreadsheet import review",
    description: "When rows from a spreadsheet import are rejected: review them and approve a fix.",
    definition: {
      name: "Spreadsheet import review",
      description: "Someone checks the import results.",
      triggerType: "csv_import.failed",
      steps: [
        {
          name: "Review the rejected rows",
          type: "task",
          assignedRole: "manager",
          configuration: {dueHours: 24},
        },
        {
          name: "Approve the fix",
          type: "approval",
          assignedRole: "admin",
          configuration: {dueHours: 24},
        },
        {name: "Complete", type: "complete", configuration: {}},
      ],
    },
  },
  {
    key: "correlation_review",
    name: "Related events review",
    description: "When Ghost links related events: someone checks whether the link makes sense.",
    definition: {
      name: "Related events review",
      description: "Someone checks a link between events. A link isn't proof one caused the other.",
      triggerType: "correlation.created",
      steps: [
        {
          name: "Look at the linked events",
          type: "task",
          assignedRole: "manager",
          configuration: {dueHours: 24},
        },
        {
          name: "Confirm the review is done",
          type: "manual_confirmation",
          assignedRole: "manager",
          configuration: {},
        },
        {name: "Complete", type: "complete", configuration: {}},
      ],
    },
  },
  {
    key: "background_job_recovery",
    name: "Background job recovery",
    description: "When a background task fails: review the error and approve a retry.",
    definition: {
      name: "Background job recovery",
      description: "Retry a failed background task after someone approves.",
      triggerType: "background_job.failed",
      steps: [
        {
          name: "Review the error",
          type: "task",
          assignedRole: "manager",
          configuration: {dueHours: 2},
        },
        {
          name: "Approve a retry",
          type: "approval",
          assignedRole: "admin",
          configuration: {dueHours: 4},
        },
        {
          name: "Retry the task",
          type: "background_job",
          configuration: {jobKeyFromTrigger: "jobKey"},
        },
        {name: "Complete", type: "complete", configuration: {}},
      ],
    },
  },
];
export const getWorkflowTemplate = (key: string) => workflowTemplates.find((x) => x.key === key);
