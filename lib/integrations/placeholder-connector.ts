import type {ConnectorOperationResult,ConnectorSyncResult,IntegrationConnector,IntegrationHealth} from "./connector";
export class PlaceholderConnector implements IntegrationConnector {
  constructor(readonly provider:string){}
  async connect():Promise<ConnectorOperationResult>{return{ok:false,message:`${this.provider} is not implemented yet.`}}
  async disconnect():Promise<ConnectorOperationResult>{return{ok:true}}
  async refresh():Promise<ConnectorOperationResult>{return{ok:false,message:"Credential refresh is not available."}}
  async sync():Promise<ConnectorSyncResult>{return{received:0,events:[]}}
  async healthCheck():Promise<IntegrationHealth>{return"unknown"}
  translate(){return null}
}
