import {INTELLIGENCE_CONFIG as C} from "../../config";
import {hoursBetween,proximityConfidence} from "../../helpers";
import type {IntelligenceRule} from "../../types";

export const deploymentTrafficDeclineRule:IntelligenceRule={
  id:"cross_provider.deployment_traffic_decline",name:"Deployment followed by traffic decline",
  description:"Correlates a successful deployment with a subsequent analytics traffic decline.",priority:20,
  supportedProviders:["github","google_analytics"],
  evaluate(events){
    const deployments=events.filter(event=>["deployment.completed","workflow.success"].includes(event.eventType));
    const declines=events.filter(event=>event.eventType==="analytics.traffic_decreased");
    return declines.flatMap(decline=>{
      const deployment=deployments.filter(item=>hoursBetween(item.occurredAt,decline.occurredAt)>=0&&hoursBetween(item.occurredAt,decline.occurredAt)<=C.deploymentCorrelationHours)
        .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt))[0];
      if(!deployment)return[];
      const hours=hoursBetween(deployment.occurredAt,decline.occurredAt);
      return[{title:"Possible deployment impact",summary:`Traffic declined after ${deployment.title}.`,severity:decline.severity==="critical"?"critical":"warning",confidence:proximityConfidence(hours,C.deploymentCorrelationHours,70,92),explanation:`A deployment was recorded ${Math.round(hours)} hour${Math.round(hours)===1?"":"s"} before the traffic decline. This is a correlation, not proof of causation.`,recommendation:"Review the deployment changes and compare analytics, errors, and tracking before and after release.",sourceEventIds:[deployment.id,decline.id],fingerprintKey:`${deployment.id}:${decline.id}`,metadata:{hoursBetween:Math.round(hours*10)/10}}];
    });
  }
};
