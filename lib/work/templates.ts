export const builtInWorkTemplates = [
  {
    key: "integration-reconnect",
    type: "task",
    name: "Reconnect a tool",
    description:
      "Get a connected tool working again after its login expired or it was disconnected.",
    priority: "high",
    configuration: {
      title: "Reconnect a tool",
      checklist: [
        {label: "Check which tool stopped working", required: true},
        {label: "Reconnect it from Connections", required: true},
        {label: "Click Sync now and check new data arrives", required: true},
      ],
    },
  },
  {
    key: "failed-job-investigation",
    type: "case_with_tasks",
    name: "Background task keeps failing",
    description: "Find out why a background task keeps failing and fix it.",
    priority: "high",
    configuration: {
      title: "Investigate a failing background task",
      tasks: [
        "Review recent run evidence",
        "Correct deterministic configuration",
        "Retry and verify",
      ],
    },
  },
  {
    key: "data-import-remediation",
    type: "case_with_tasks",
    name: "Fix a spreadsheet import",
    description: "Fix rows from a spreadsheet import that were rejected or duplicated.",
    priority: "normal",
    configuration: {
      title: "Fix a spreadsheet import",
      tasks: ["Review rejected rows", "Correct source data", "Re-import and verify"],
    },
  },
] as const;
