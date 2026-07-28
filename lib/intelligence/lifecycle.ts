import type {InsightStatus} from "./types";
export type InsightAction="acknowledge"|"dismiss"|"resolve";
export function transitionInsight(status:InsightStatus,action:InsightAction):InsightStatus{
  if(action==="acknowledge")return status==="active"?"acknowledged":status;
  if(action==="dismiss")return status==="active"||status==="acknowledged"?"dismissed":status;
  return status==="active"||status==="acknowledged"?"resolved":status;
}
