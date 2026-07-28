import type {EventSeverity} from "@/types/events";
export type InsightStatus="active"|"acknowledged"|"dismissed"|"resolved";
export type IntelligenceEvent={id:string;source:string;eventType:string;title:string;description:string|null;severity:EventSeverity;occurredAt:string;metadata:Record<string,unknown>};
export type InsightCandidate={title:string;summary:string;severity:EventSeverity;confidence:number;explanation:string;recommendation:string;sourceEventIds:string[];fingerprintKey:string;metadata?:Record<string,unknown>;resolveRuleIds?:string[]};
export type IntelligenceRule={id:string;name:string;description:string;priority:number;supportedProviders:string[];evaluate(events:IntelligenceEvent[]):InsightCandidate[]};
