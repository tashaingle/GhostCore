import {describe,expect,it} from "vitest";
import {insightFingerprint} from "@/lib/intelligence/fingerprint";
import {evaluateRules} from "@/lib/intelligence/runner";
import {transitionInsight} from "@/lib/intelligence/lifecycle";
import {calculateInsightMetrics} from "@/lib/intelligence/dashboard";
import {mergeTimelineItems} from "@/lib/intelligence/timeline";
import {intelligenceRules,repeatedWorkflowFailuresRule,trackingInactiveRule,trafficDeclineStableConversionsRule} from "@/lib/intelligence/rules";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
const event=(id:string,eventType:string,occurredAt:string,metadata:Record<string,unknown>={}):IntelligenceEvent=>({id,source:eventType.startsWith("analytics.")?"google_analytics":"github",eventType,title:id,description:null,severity:eventType.includes("failed")?"critical":"warning",occurredAt,metadata});
describe("intelligence engine",()=>{
  it("creates deterministic, rule-specific fingerprints",()=>{expect(insightFingerprint("a","same")).toBe(insightFingerprint("a","same"));expect(insightFingerprint("a","same")).not.toBe(insightFingerprint("b","same"))});
  it("registers unique modular rules in priority order",()=>{expect(new Set(intelligenceRules.map(rule=>rule.id)).size).toBe(intelligenceRules.length);expect(intelligenceRules.map(rule=>rule.priority)).toEqual([...intelligenceRules].map(rule=>rule.priority).sort((a,b)=>a-b))});
  it("correlates deployments and traffic without provider-specific insertion",()=>{
    const results=evaluateRules([event("deploy","workflow.success","2026-07-27T10:00:00Z"),event("drop","analytics.traffic_decreased","2026-07-27T18:00:00Z",{currentKeyEvents:10,previousKeyEvents:10})]);
    expect(results.map(item=>item.ruleId)).toContain("cross_provider.deployment_traffic_decline");expect(results.every(item=>item.confidence>=0&&item.confidence<=100)).toBe(true);
  });
  it("assigns very high confidence to a failed workflow before a decline",()=>{const result=evaluateRules([event("failure","workflow.failed","2026-07-27T10:00:00Z"),event("drop","analytics.traffic_decreased","2026-07-27T11:00:00Z")]).find(item=>item.ruleId==="cross_provider.failed_deployment_traffic_decline");expect(result?.confidence).toBeGreaterThanOrEqual(90);expect(result?.severity).toBe("warning")});
  it("detects stable conversions with a traffic decline",()=>{const result=trafficDeclineStableConversionsRule.evaluate([event("drop","analytics.traffic_decreased","2026-07-27T11:00:00Z",{currentKeyEvents:101,previousKeyEvents:100})]);expect(result).toHaveLength(1);expect(result[0].recommendation).toMatch(/tracking/i)});
  it("requires the configured workflow failure threshold",()=>{const two=[event("a","workflow.failed","2026-07-27T10:00:00Z"),event("b","workflow.failed","2026-07-27T11:00:00Z")];expect(repeatedWorkflowFailuresRule.evaluate(two)).toHaveLength(0);expect(repeatedWorkflowFailuresRule.evaluate([...two,event("c","workflow.failed","2026-07-27T12:00:00Z")])).toHaveLength(1)});
  it("creates a critical inactive-tracking insight",()=>{expect(trackingInactiveRule.evaluate([event("zero","analytics.tracking_inactive","2026-07-27T10:00:00Z")])[0]).toMatchObject({severity:"critical",confidence:98})});
  it("marks recovery candidates with rules to resolve",()=>{const result=evaluateRules([event("drop","analytics.traffic_decreased","2026-07-20T10:00:00Z"),event("up","analytics.traffic_increased","2026-07-27T10:00:00Z")]).find(item=>item.ruleId==="analytics.analytics_recovered");expect(result?.resolveRuleIds).toContain("analytics.tracking_inactive")});
  it("enforces valid lifecycle transitions",()=>{expect(transitionInsight("active","acknowledge")).toBe("acknowledged");expect(transitionInsight("acknowledged","dismiss")).toBe("dismissed");expect(transitionInsight("resolved","acknowledge")).toBe("resolved")});
  it("calculates provider-agnostic overview metrics",()=>{const metrics=calculateInsightMetrics([{status:"active",severity:"critical",confidence:90,resolved_at:null,recommendation:"Fix it"},{status:"resolved",severity:"warning",confidence:70,resolved_at:"2026-07-28T02:00:00Z",recommendation:"Done"}],new Date("2026-07-28T12:00:00Z"));expect(metrics).toMatchObject({active:1,critical:1,resolvedToday:1,averageConfidence:90,topRecommendation:"Fix it"})});
  it("merges event and insight timeline items chronologically",()=>{const merged=mergeTimelineItems([{id:"e",kind:"event",title:"Event",summary:null,severity:"info",timestamp:"2026-07-27T10:00:00Z",label:"event"}],[{id:"i",kind:"insight",title:"Insight",summary:null,severity:"warning",timestamp:"2026-07-28T10:00:00Z",label:"insight"}]);expect(merged.map(item=>item.kind)).toEqual(["insight","event"])});
});
