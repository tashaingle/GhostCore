import type {InsightStatus} from "./types";
export type InsightMetricRow={status:InsightStatus;severity:string;confidence:number;resolved_at:string|null;recommendation:string};
export function calculateInsightMetrics(rows:InsightMetricRow[],now=new Date()){
  const active=rows.filter(row=>row.status==="active"||row.status==="acknowledged");
  const day=now.toISOString().slice(0,10);
  const resolvedToday=rows.filter(row=>row.status==="resolved"&&row.resolved_at?.slice(0,10)===day).length;
  const top=[...active].sort((a,b)=>b.confidence-a.confidence)[0];
  return{active:active.length,critical:active.filter(row=>row.severity==="critical").length,resolvedToday,averageConfidence:active.length?Math.round(active.reduce((sum,row)=>sum+row.confidence,0)/active.length):0,topRecommendation:top?.recommendation??"No active recommendations."};
}
