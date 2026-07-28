import {INTELLIGENCE_CONFIG as C} from "../../config";
import {hoursBetween,proximityConfidence} from "../../helpers";
import type {IntelligenceRule} from "../../types";

export const failedDeploymentTrafficDeclineRule:IntelligenceRule={
  id:"cross_provider.failed_deployment_traffic_decline",name:"Failed deployment before traffic decline",
  description:"Finds a failed workflow shortly before a traffic decline.",priority:10,supportedProviders:["github","google_analytics"],
  evaluate(events){
    const failures=events.filter(event=>event.eventType==="workflow.failed");
    return events.filter(event=>event.eventType==="analytics.traffic_decreased").flatMap(decline=>{
      const failure=failures.filter(item=>hoursBetween(item.occurredAt,decline.occurredAt)>=0&&hoursBetween(item.occurredAt,decline.occurredAt)<=C.failedDeploymentCorrelationHours)
        .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt))[0];
      if(!failure)return[];
      const hours=hoursBetween(failure.occurredAt,decline.occurredAt);
      return[{title:"Failed deployment preceded traffic decline",summary:`${failure.title} occurred before traffic fell.`,severity:"warning" as const,confidence:proximityConfidence(hours,C.failedDeploymentCorrelationHours,90,98),explanation:`A failed GitHub workflow was recorded ${Math.round(hours)} hours before the analytics decline, creating a strong temporal correlation.`,recommendation:"Inspect the failed workflow and verify the deployed application and analytics instrumentation.",sourceEventIds:[failure.id,decline.id],fingerprintKey:`${failure.id}:${decline.id}`,metadata:{hoursBetween:Math.round(hours*10)/10}}];
    });
  }
};
