import {INTELLIGENCE_CONFIG as C} from "../../config";
import {metadataNumber} from "../../helpers";
import type {IntelligenceRule} from "../../types";

export const trafficDeclineStableConversionsRule:IntelligenceRule={
  id:"cross_provider.traffic_decline_stable_conversions",name:"Traffic decline with stable conversions",
  description:"Flags a possible measurement issue when sessions fall but conversions remain stable.",priority:30,supportedProviders:["google_analytics"],
  evaluate(events){
    return events.filter(event=>event.eventType==="analytics.traffic_decreased").flatMap(event=>{
      const current=metadataNumber(event.metadata,"currentKeyEvents"),previous=metadataNumber(event.metadata,"previousKeyEvents");
      if(current===null||previous===null)return[];
      const change=previous===0?(current===0?0:Infinity):Math.abs((current-previous)/previous*100);
      if(change>C.stableConversionTolerancePercent)return[];
      return[{title:"Traffic declined while conversions remained stable",summary:"The traffic movement may reflect a tracking or attribution issue rather than demand alone.",severity:"warning" as const,confidence:Math.min(90,78+Math.round(Math.max(0,previous)/10)),explanation:`Sessions declined, while key events changed by only ${Math.round(change*10)/10}% (${previous} to ${current}).`,recommendation:"Validate session tracking, consent configuration, filters, and channel attribution before changing acquisition strategy.",sourceEventIds:[event.id],fingerprintKey:event.id,metadata:{conversionChangePercent:Math.round(change*10)/10,currentKeyEvents:current,previousKeyEvents:previous}}];
    });
  }
};
