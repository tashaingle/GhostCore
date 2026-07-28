import type {IntegrationConnector,IntegrationSyncContext,RawProviderRecord,TranslationContext} from "../connector";
import {SearchConsoleClient,SearchConsoleError} from "./client";
import {GSC_LIMITS} from "./config";
import {translateSearchConsole} from "./translator";
import type {PropertySnapshot,SearchConsoleSettings} from "./types";
const iso=(date:Date)=>date.toISOString().slice(0,10);
export class GoogleSearchConsoleConnector implements IntegrationConnector{
  readonly provider="google_search_console";private error?:unknown;
  constructor(private client:SearchConsoleClient,private settings:SearchConsoleSettings,private now:()=>Date=()=>new Date()){}
  connect=async()=>({ok:(await this.client.properties()).length>=0});
  disconnect=async()=>{await this.client.revoke();return{ok:true}};
  refresh=async()=>({ok:true});
  healthError=()=>this.error;
  async healthCheck(){try{await this.client.properties();return"healthy"as const}catch(error){this.error=error;return error instanceof SearchConsoleError&&error.kind==="unauthorized"?"expired"as const:"error"as const}}
  translate(record:RawProviderRecord,ctx:TranslationContext){return translateSearchConsole(record as unknown as PropertySnapshot,ctx,this.settings)}
  async sync(ctx:IntegrationSyncContext){
    const selected=(this.settings.properties??[]).filter(p=>p.selected).slice(0,GSC_LIMITS.properties);if(!selected.length)throw new SearchConsoleError("forbidden","Choose at least one Search Console property before syncing.");
    const initial=!this.settings.initialSyncComplete,days=initial?45:GSC_LIMITS.comparisonDays,end=new Date(this.now());end.setUTCDate(end.getUTCDate()-3);const currentEnd=iso(end),currentStartDate=new Date(end);currentStartDate.setUTCDate(currentStartDate.getUTCDate()-days+1);const previousEndDate=new Date(currentStartDate);previousEndDate.setUTCDate(previousEndDate.getUTCDate()-1);const previousStartDate=new Date(previousEndDate);previousStartDate.setUTCDate(previousStartDate.getUTCDate()-days+1);
    const snapshots:PropertySnapshot[]=[],events=[],started=Date.now();let received=0,failures=0;
    for(const property of selected){if(Date.now()-started>GSC_LIMITS.runtimeMs){failures++;break}try{const [currentRows,previousRows,sitemaps]=await Promise.all([this.client.search(property.siteUrl,iso(currentStartDate),currentEnd),this.client.search(property.siteUrl,iso(previousStartDate),iso(previousEndDate)),this.client.sitemaps(property.siteUrl)]),pages=[...new Set(currentRows.map(r=>r.keys?.[0]).filter((v):v is string=>Boolean(v)))].slice(0,GSC_LIMITS.inspectionUrlsPerProperty),inspections=[];for(const page of pages){try{inspections.push(await this.client.inspect(property.siteUrl,page))}catch{failures++}}const snapshot={property,current:{startDate:iso(currentStartDate),endDate:currentEnd,rows:currentRows},previous:{startDate:iso(previousStartDate),endDate:iso(previousEndDate),rows:previousRows},sitemaps,inspections};snapshots.push(snapshot);received+=currentRows.length+previousRows.length+sitemaps.length+inspections.length;events.push(...translateSearchConsole(snapshot,{...ctx,receivedAt:ctx.receivedAt??this.now().toISOString()},this.settings))}catch{failures++}}
    return{received,events,filtered:Math.max(0,received-events.length),credentials:this.client.credentialUpdate(),settings:{...this.settings,initialSyncComplete:failures===0,lastSyncAt:this.now().toISOString(),lastSyncMode:initial?"search_console_initial_90_day_comparison":"search_console_7_day_reconciliation",partialFailures:failures,propertiesProcessed:snapshots.length,rowsAnalysed:received}};
  }
}
