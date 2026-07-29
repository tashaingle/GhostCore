import type {EventRow} from "@/types/events";

export type CorrelationDirection="upstream"|"downstream"|"bidirectional"|"undirected";
export type CorrelationStrength="confirmed"|"strong"|"moderate"|"weak"|"rejected";
export type EvidenceType="identifier"|"text_identifier"|"url"|"domain"|"amount"|"currency"|"temporal"|"attribution"|"conflict";
export type CorrelationEvidence={type:EvidenceType;field:string;sourceHash:string;targetHash:string;matched:boolean;score:number;explanation:string;metadata?:Record<string,unknown>};
export type CorrelationEvaluation={accepted:boolean;score:number;strength:CorrelationStrength;evidence:CorrelationEvidence[];explanation:string[];rejectionReason?:string};
export type CorrelationRule={
  key:string;version:number;name:string;description:string;providers:readonly [string,string];sourceEventTypes:readonly string[];targetEventTypes:readonly string[];
  relationshipType:string;direction:CorrelationDirection;timeWindowSeconds:number;minimumScore:number;
  evaluate(source:EventRow,target:EventRow):CorrelationEvaluation;
};
export type CorrelationCandidate={source:EventRow;target:EventRow};
export type CorrelationRunSummary={rules:number;events:number;candidates:number;created:number;updated:number;duplicates:number;errors:number};
export type RuleSetting={enabled?:boolean;minimumScore?:number;timeWindowSeconds?:number;eligibleIntegrationIds?:string[];manualFieldKeys?:string[]};
