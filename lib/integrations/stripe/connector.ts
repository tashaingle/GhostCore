import type Stripe from "stripe";
import type {IntegrationConnector,IntegrationSyncContext,RawProviderRecord,TranslationContext} from "../connector";
import {STRIPE_INITIAL_DAYS,STRIPE_RECONCILE_HOURS} from "./config";
import {stripeClient,listStripeEvents} from "./client";
import {GhostStripeError,safeStripeError} from "./errors";
import {translateStripeEvent} from "./translator";

export type StripeSettings={mode:"test"|"live";accountId:string;accountName?:string;country?:string;defaultCurrency?:string;chargesEnabled?:boolean;payoutsEnabled?:boolean;detailsSubmitted?:boolean;connectedAt?:string;initialSyncComplete?:boolean;lastReconciledAt?:string;latestEventCreated?:number;lastWebhookAt?:string;syncPayments?:boolean;syncInvoices?:boolean;syncSubscriptions?:boolean;syncPayouts?:boolean;syncDisputes?:boolean};
export class StripeConnector implements IntegrationConnector{
  readonly provider="stripe";private error?:unknown;
  constructor(private settings:StripeSettings){}
  connect=async()=>({ok:true});
  disconnect=async()=>({ok:true,message:"Stripe credentials will be removed locally."});
  refresh=async()=>({ok:true});
  healthError=()=>this.error;
  async healthCheck(){try{await stripeClient().accounts.retrieve(this.settings.accountId);return"healthy"as const}catch(error){this.error=safeStripeError(error);return this.error instanceof GhostStripeError&&this.error.kind==="unauthorized"?"expired"as const:"error"as const}}
  translate(record:RawProviderRecord,ctx:TranslationContext){return translateStripeEvent(record as unknown as Stripe.Event,ctx,this.settings.mode)}
  async sync(ctx:IntegrationSyncContext){
    const now=Date.now(),initial=!this.settings.initialSyncComplete,createdGte=Math.floor((now-(initial?STRIPE_INITIAL_DAYS*864e5:STRIPE_RECONCILE_HOURS*36e5))/1000);
    const result=await listStripeEvents(this.settings.accountId,createdGte),context={...ctx,receivedAt:ctx.receivedAt??new Date().toISOString()},events=result.events.flatMap(event=>this.translate(event as unknown as RawProviderRecord,context)??[]);
    const latest=result.events.reduce((value,event)=>Math.max(value,event.created),this.settings.latestEventCreated??0);
    return{received:result.events.length,events,pages:result.pages,filtered:result.events.length-events.length,settings:{...this.settings,initialSyncComplete:initial?!result.truncated:true,lastSyncMode:initial?"stripe_initial":"stripe_reconciliation",lastReconciledAt:new Date().toISOString(),latestEventCreated:latest,truncated:result.truncated,windowHours:initial?STRIPE_INITIAL_DAYS*24:STRIPE_RECONCILE_HOURS}};
  }
}
