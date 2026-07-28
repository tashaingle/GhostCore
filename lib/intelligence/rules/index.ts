import type {IntelligenceRule} from "../types";
import {analyticsRecoveredRule} from "./analytics/analytics-recovered";
import {trackingInactiveRule} from "./analytics/tracking-inactive";
import {deploymentTrafficDeclineRule} from "./cross-provider/deployment-traffic-decline";
import {failedDeploymentTrafficDeclineRule} from "./cross-provider/failed-deployment-traffic-decline";
import {trafficDeclineStableConversionsRule} from "./cross-provider/traffic-decline-stable-conversions";
import {repeatedWorkflowFailuresRule} from "./github/repeated-workflow-failures";
export const intelligenceRules:IntelligenceRule[]=[trackingInactiveRule,failedDeploymentTrafficDeclineRule,deploymentTrafficDeclineRule,trafficDeclineStableConversionsRule,repeatedWorkflowFailuresRule,analyticsRecoveredRule].sort((a,b)=>a.priority-b.priority);
export {analyticsRecoveredRule,trackingInactiveRule,deploymentTrafficDeclineRule,failedDeploymentTrafficDeclineRule,trafficDeclineStableConversionsRule,repeatedWorkflowFailuresRule};
