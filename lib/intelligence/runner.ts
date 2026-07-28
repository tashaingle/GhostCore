import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "@/types/database";
import {INTELLIGENCE_CONFIG as C} from "./config";
import {insightFingerprint} from "./fingerprint";
import {intelligenceRules} from "./rules";
import type {InsightCandidate,IntelligenceEvent,IntelligenceRule} from "./types";

export type EvaluatedInsight=InsightCandidate&{ruleId:string;fingerprint:string};
export type IntelligenceRunSummary={evaluatedRules:number;candidates:number;inserted:number;updated:number;resolved:number};

export function evaluateRules(events:IntelligenceEvent[],rules:IntelligenceRule[]=intelligenceRules):EvaluatedInsight[]{
  return [...rules].sort((a,b)=>a.priority-b.priority).flatMap(rule=>rule.evaluate(events).map(candidate=>({
    ...candidate,confidence:Math.max(0,Math.min(100,Math.round(candidate.confidence))),
    sourceEventIds:[...new Set(candidate.sourceEventIds)].sort(),ruleId:rule.id,
    fingerprint:insightFingerprint(rule.id,candidate.fingerprintKey),
  })));
}

export async function runIntelligence(supabase:SupabaseClient<Database>,organisationId:string):Promise<IntelligenceRunSummary>{
  const since=new Date(Date.now()-C.rollingWindowDays*86400000).toISOString();
  const {data,error}=await supabase.from("events").select("id,source,event_type,title,description,severity,occurred_at,metadata")
    .eq("organisation_id",organisationId).gte("occurred_at",since).order("occurred_at",{ascending:false}).limit(C.maxEvents);
  if(error)throw new Error(`Intelligence could not load events: ${error.message}`);
  const events:IntelligenceEvent[]=(data??[]).map(event=>({id:event.id,source:event.source,eventType:event.event_type,title:event.title,description:event.description,severity:event.severity as IntelligenceEvent["severity"],occurredAt:event.occurred_at,metadata:event.metadata&&typeof event.metadata==="object"&&!Array.isArray(event.metadata)?event.metadata as Record<string,unknown>:{}}));
  const candidates=evaluateRules(events),fingerprints=candidates.map(item=>item.fingerprint);
  const existing=new Map<string,{id:string;status:string}>();
  if(fingerprints.length){
    const {data:rows,error:existingError}=await supabase.from("insights").select("id,fingerprint,status").eq("organisation_id",organisationId).in("fingerprint",fingerprints);
    if(existingError)throw new Error(`Intelligence could not inspect existing insights: ${existingError.message}`);
    for(const row of rows??[])existing.set(row.fingerprint,{id:row.id,status:row.status});
  }
  let inserted=0,updated=0,resolved=0;const now=new Date().toISOString();
  for(const candidate of candidates){
    const previous=existing.get(candidate.fingerprint);
    const values={title:candidate.title,summary:candidate.summary,severity:candidate.severity,confidence:candidate.confidence,rule_id:candidate.ruleId,explanation:candidate.explanation,recommendation:candidate.recommendation,metadata:(candidate.metadata??{}) as Json,source_event_ids:candidate.sourceEventIds,updated_at:now};
    if(previous){
      const {error:updateError}=await supabase.from("insights").update(values).eq("id",previous.id).eq("organisation_id",organisationId);
      if(updateError)throw new Error(`Intelligence could not update an insight: ${updateError.message}`);updated++;
    }else{
      const {error:insertError}=await supabase.from("insights").insert({...values,organisation_id:organisationId,fingerprint:candidate.fingerprint,status:"active"});
      if(insertError)throw new Error(`Intelligence could not create an insight: ${insertError.message}`);inserted++;
    }
    if(candidate.resolveRuleIds?.length){
      const {data:resolvedRows,error:resolveError}=await supabase.from("insights").update({status:"resolved",resolved_at:now,updated_at:now}).eq("organisation_id",organisationId).in("rule_id",candidate.resolveRuleIds).in("status",["active","acknowledged"]).select("id");
      if(resolveError)throw new Error(`Intelligence could not resolve recovered insights: ${resolveError.message}`);resolved+=resolvedRows?.length??0;
    }
  }
  return{evaluatedRules:intelligenceRules.length,candidates:candidates.length,inserted,updated,resolved};
}
