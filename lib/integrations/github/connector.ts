import "server-only";
import type {ConnectorOperationResult,ConnectorSyncResult,IntegrationConnector,IntegrationHealth,IntegrationSyncContext,TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import {GitHubApi,GitHubApiError} from "./api";
import {githubActivityTranslator,githubWorkflowTranslator} from "./translator";
import type {GitHubActivity,GitHubWorkflowRun} from "./types";
type GitHubRecord={kind:"activity";value:GitHubActivity}|{kind:"workflow";value:GitHubWorkflowRun};
export class GitHubConnector implements IntegrationConnector<GitHubRecord>{
  provider="github";
  constructor(private api:Pick<GitHubApi,"user"|"activity"|"workflowRuns">){}
  async account(){return this.api.user()}
  async connect():Promise<ConnectorOperationResult>{await this.api.user();return{ok:true}}
  async disconnect():Promise<ConnectorOperationResult>{return{ok:true}}
  async refresh():Promise<ConnectorOperationResult>{await this.api.user();return{ok:true}}
  async healthCheck():Promise<IntegrationHealth>{try{await this.api.user();return"healthy"}catch(error){return error instanceof GitHubApiError&&error.kind==="unauthorized"?"expired":"error"}}
  translate(record:GitHubRecord,context:TranslationContext){return record.kind==="activity"?githubActivityTranslator.translate(record.value,context):githubWorkflowTranslator.translate(record.value,context)}
  async sync(context:IntegrationSyncContext):Promise<ConnectorSyncResult>{
    const account=await this.api.user();const activity=await this.api.activity(account.login);
    const repositories=[...new Set(activity.map(item=>item.repo.name))];const workflows=await this.api.workflowRuns(repositories);
    const translationContext={...context,receivedAt:context.receivedAt??new Date().toISOString()};
    const records:GitHubRecord[]=[...activity.map(value=>({kind:"activity" as const,value})),...workflows.map(value=>({kind:"workflow" as const,value}))];
    const events=records.flatMap(record=>{const translated=this.translate(record,translationContext);return translated?Array.isArray(translated)?translated:[translated]:[]}).filter((event):event is NormalisedEventInput=>Boolean(event));
    return{received:records.length,events};
  }
}
