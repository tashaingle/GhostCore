export const workflowTriggers=["notification.created","notification.resolved","correlation.created","background_job.failed","integration.error","integration.reconnected","csv_import.completed","csv_import.failed","organisation.created","manual","scheduled","webhook"]as const;
export const workflowStepTypes=["task","approval","condition","delay","background_job","notification","integration_action","webhook","manual_confirmation","complete"]as const;
export type WorkflowTrigger=typeof workflowTriggers[number];export type WorkflowStepType=typeof workflowStepTypes[number];
export type StepInput={name:string;type:WorkflowStepType;configuration:Record<string,unknown>;timeoutSeconds?:number;maxRetries?:number;failurePolicy?:"fail"|"continue"|"pause";assignedRole?:string|null};
export type WorkflowDefinitionInput={name:string;description:string;triggerType:WorkflowTrigger;steps:StepInput[]};
export type ExecutionResult={runId:string;status:string;duplicate:boolean;stepsProcessed:number};
