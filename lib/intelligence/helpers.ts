import type {IntelligenceEvent} from "./types";
export const hoursBetween=(earlier:string,later:string)=>(new Date(later).getTime()-new Date(earlier).getTime())/3600000;
export const byNewest=(events:IntelligenceEvent[])=>[...events].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
export function metadataNumber(metadata:Record<string,unknown>,key:string){const value=metadata[key];return typeof value==="number"&&Number.isFinite(value)?value:null}
export function proximityConfidence(hours:number,window:number,base:number,max:number){return Math.round(Math.min(max,Math.max(base,max-(hours/window)*(max-base))))}
