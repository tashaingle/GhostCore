import type {NormalisedEventInput} from "@/types/events";
export type RawProviderRecord=Record<string,unknown>;
export type IntegrationHealth="healthy"|"syncing"|"error"|"expired"|"disconnected"|"unknown";
export type IntegrationCapability="oauth"|"polling"|"webhooks"|"realtime"|"manual"|"read_only"|"read_write";
export type SyncSchedule="manual"|"hourly"|"daily"|"webhook";
export type IntegrationSyncContext={organisationId:string;integrationId:string;receivedAt?:string};
export type TranslationContext=IntegrationSyncContext&{receivedAt:string};
export type ConnectorCredentialUpdate={accessToken:string;refreshToken?:string;expiresAt?:string};
export type ConnectorSyncResult={received:number;events:NormalisedEventInput[];rateLimited?:boolean;credentials?:ConnectorCredentialUpdate;settings?:Record<string,unknown>;filtered?:number;pages?:number};
export type ConnectorOperationResult={ok:boolean;message?:string};
export interface IntegrationConnector<T=RawProviderRecord>{
  readonly provider:string;
  connect(context:IntegrationSyncContext):Promise<ConnectorOperationResult>;
  disconnect(context:IntegrationSyncContext):Promise<ConnectorOperationResult>;
  refresh(context:IntegrationSyncContext):Promise<ConnectorOperationResult>;
  sync(context:IntegrationSyncContext):Promise<ConnectorSyncResult>;
  healthCheck(context:IntegrationSyncContext):Promise<IntegrationHealth>;
  healthError?():unknown;
  translate(record:T,context:TranslationContext):NormalisedEventInput|NormalisedEventInput[]|null;
}
export interface EventTranslator<T=RawProviderRecord>{translate(record:T,context:TranslationContext):NormalisedEventInput|NormalisedEventInput[]|null}
