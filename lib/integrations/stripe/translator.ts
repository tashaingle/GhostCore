import {createHash} from "node:crypto";
import type Stripe from "stripe";
import type {NormalisedEventInput,EventSeverity} from "@/types/events";
import type {TranslationContext} from "../connector";

type AnyObject={id?:string;object?:string;amount?:number;amount_received?:number;amount_refunded?:number;currency?:string;status?:string;customer?:string|{id?:string};payment_intent?:string|{id?:string};charge?:string|{id?:string};paid?:boolean;refunded?:boolean;failure_code?:string;failure_reason?:string;cancel_at_period_end?:boolean;current_period_start?:number;current_period_end?:number;trial_start?:number;trial_end?:number;arrival_date?:number;reason?:string};
const clean=(v:unknown,n=200)=>String(v??"").replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const idOf=(v:unknown)=>typeof v==="string"?v:v&&typeof v==="object"&&"id"in v?String((v as{id?:unknown}).id??""):undefined;
export function formatMinorAmount(amount:number,currency:string){
  const code=currency.toUpperCase();const fraction=new Intl.NumberFormat("en-GB",{style:"currency",currency:code}).resolvedOptions().maximumFractionDigits??2;
  return new Intl.NumberFormat("en-GB",{style:"currency",currency:code}).format(amount/(10**fraction));
}
const mapping:Record<string,[string,string,EventSeverity]>={
  "payment_intent.succeeded":["stripe.payment_succeeded","Payment succeeded","good"],"payment_intent.payment_failed":["stripe.payment_failed","Payment failed","critical"],"payment_intent.canceled":["stripe.payment_cancelled","Payment cancelled","warning"],
  "refund.created":["stripe.payment_refunded","Refund created","warning"],"refund.updated":["stripe.payment_refunded","Refund updated","warning"],"refund.failed":["stripe.refund_failed","Refund failed","critical"],
  "checkout.session.completed":["stripe.checkout_completed","Checkout completed","good"],"checkout.session.async_payment_succeeded":["stripe.checkout_completed","Checkout payment succeeded","good"],"checkout.session.async_payment_failed":["stripe.payment_failed","Checkout payment failed","critical"],"checkout.session.expired":["stripe.checkout_expired","Checkout expired","warning"],
  "invoice.created":["stripe.invoice_created","Invoice created","info"],"invoice.finalized":["stripe.invoice_finalised","Invoice finalised","info"],"invoice.paid":["stripe.invoice_paid","Invoice paid","good"],"invoice.payment_failed":["stripe.invoice_payment_failed","Invoice payment failed","critical"],"invoice.voided":["stripe.invoice_voided","Invoice voided","warning"],"invoice.marked_uncollectible":["stripe.invoice_uncollectible","Invoice marked uncollectible","critical"],
  "customer.subscription.created":["stripe.subscription_started","Subscription started","good"],"customer.subscription.updated":["stripe.subscription_changed","Subscription changed","info"],"customer.subscription.deleted":["stripe.subscription_cancelled","Subscription cancelled","warning"],"customer.subscription.paused":["stripe.subscription_paused","Subscription paused","warning"],"customer.subscription.resumed":["stripe.subscription_resumed","Subscription resumed","good"],"customer.subscription.trial_will_end":["stripe.subscription_trial_ending","Subscription trial ending","warning"],
  "charge.dispute.created":["stripe.dispute_opened","Dispute opened","critical"],"charge.dispute.updated":["stripe.dispute_updated","Dispute updated","warning"],"charge.dispute.closed":["stripe.dispute_updated","Dispute closed","info"],
  "payout.created":["stripe.payout_created","Payout created","info"],"payout.paid":["stripe.payout_paid","Payout paid","good"],"payout.failed":["stripe.payout_failed","Payout failed","critical"],"payout.canceled":["stripe.payout_cancelled","Payout cancelled","warning"],
};
export function translateStripeEvent(event:Stripe.Event,ctx:TranslationContext,mode:"test"|"live"):NormalisedEventInput|null{
  const spec=mapping[event.type];if(!spec||!event.id||!event.data?.object)return null;
  const object=event.data.object as AnyObject,amount=Number.isSafeInteger(object.amount_received)?object.amount_received:Number.isSafeInteger(object.amount)?object.amount:undefined,currency=clean(object.currency,3).toLowerCase()||undefined;
  const customer=idOf(object.customer),customerRef=customer?createHash("sha256").update(`${ctx.integrationId}:${customer}`).digest("hex").slice(0,12):undefined;
  const metadata:Record<string,unknown>={providerEventId:event.id,providerObjectType:clean(object.object,80),providerObjectId:clean(object.id,100),mode,status:clean(object.status,60)||null};
  if(amount!==undefined&&currency){metadata.amountMinor=amount;metadata.currency=currency;metadata.displayAmount=formatMinorAmount(amount,currency)}
  if(customerRef)metadata.customerRef=customerRef;
  for(const [key,value] of Object.entries({paymentId:idOf(object.payment_intent),chargeId:idOf(object.charge),amountRefundedMinor:object.amount_refunded,cancelAtPeriodEnd:object.cancel_at_period_end,currentPeriodStart:object.current_period_start,currentPeriodEnd:object.current_period_end,trialStart:object.trial_start,trialEnd:object.trial_end,arrivalDate:object.arrival_date}))if(value!==undefined)metadata[key]=value;
  return{organisationId:ctx.organisationId,integrationId:ctx.integrationId,source:"stripe",category:"finance",eventType:spec[0],title:`${spec[1]}${amount!==undefined&&currency?` · ${formatMinorAmount(amount,currency)} ${currency.toUpperCase()}`:""}`,severity:spec[2],occurredAt:new Date(event.created*1000).toISOString(),externalId:`stripe:${ctx.integrationId}:${mode}:${event.id}:${spec[0]}`,metadata,rawPayload:{id:event.id,type:event.type,objectId:object.id??null}};
}
