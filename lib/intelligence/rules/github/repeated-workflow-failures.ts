import {INTELLIGENCE_CONFIG as C} from "../../config";
import {byNewest,hoursBetween} from "../../helpers";
import type {IntelligenceRule} from "../../types";

export const repeatedWorkflowFailuresRule:IntelligenceRule={
  id:"github.repeated_workflow_failures",name:"Multiple failed workflows",description:"Detects repeated GitHub workflow failures in a short period.",priority:40,supportedProviders:["github"],
  evaluate(events){
    const failures=byNewest(events.filter(event=>event.eventType==="workflow.failed"));
    const newest=failures[0];if(!newest)return[];
    const cluster=failures.filter(event=>hoursBetween(event.occurredAt,newest.occurredAt)>=0&&hoursBetween(event.occurredAt,newest.occurredAt)<=C.workflowFailureWindowHours);
    if(cluster.length<C.workflowFailureCount)return[];
    return[{title:"Repeated workflow failures",summary:`${cluster.length} GitHub workflows failed within ${C.workflowFailureWindowHours} hours.`,severity:cluster.length>=5?"critical":"warning",confidence:Math.min(96,70+cluster.length*6),explanation:"Repeated failures suggest the delivery pipeline or a shared dependency needs attention.",recommendation:"Review the newest failure first, identify the common job or dependency, and pause risky releases until the pipeline is stable.",sourceEventIds:cluster.map(event=>event.id),fingerprintKey:newest.occurredAt.slice(0,10),metadata:{failureCount:cluster.length,windowHours:C.workflowFailureWindowHours}}];
  }
};
