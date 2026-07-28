import {NextResponse} from "next/server";
import type Stripe from "stripe";
import type {Json} from "@/types/database";
import {createServiceClient} from "@/lib/supabase/service";
import {stripeClient} from "@/lib/integrations/stripe/client";
import {STRIPE_WEBHOOK_MAX_BYTES} from "@/lib/integrations/stripe/config";
import {translateStripeEvent} from "@/lib/integrations/stripe/translator";
export const runtime="nodejs";
const response=(message:string,status=200)=>NextResponse.json({received:status<300,message},{status});
export async function POST(request:Request){
  const signature=request.headers.get("stripe-signature"),secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!signature)return response("Missing Stripe signature.",400);if(!secret)return response("Webhook is not configured.",503);
  const declared=Number(request.headers.get("content-length")||0);if(declared>STRIPE_WEBHOOK_MAX_BYTES)return response("Payload too large.",413);
  const raw=await request.text();if(Buffer.byteLength(raw,"utf8")>STRIPE_WEBHOOK_MAX_BYTES)return response("Payload too large.",413);
  let event:Stripe.Event;try{event=stripeClient().webhooks.constructEvent(raw,signature,secret)}catch{return response("Invalid Stripe signature.",400)}
  const accountId=typeof event.account==="string"?event.account:"";if(!accountId)return response("Connected account attribution is missing.",200);
  try{
    const db=createServiceClient(),mode=event.livemode?"live":"test";
    const{data:matches,error:lookupError}=await db.from("integrations").select("id,organisation_id,status,settings").eq("provider","stripe").eq("provider_account_id",accountId).eq("status","connected");
    if(lookupError)return response("Webhook temporarily unavailable.",503);
    const integration=matches?.find(row=>row.settings&&typeof row.settings==="object"&&!Array.isArray(row.settings)&&(row.settings as Record<string,unknown>).mode===mode);
    if(!integration)return response("No active integration mapping.",200);
    const receipt={organisation_id:integration.organisation_id,integration_id:integration.id,stripe_account_id:accountId,livemode:event.livemode,stripe_event_id:event.id,stripe_event_type:event.type,provider_created_at:new Date(event.created*1000).toISOString(),processing_status:"received"};
    const{data:saved,error:receiptError}=await db.from("stripe_event_receipts").insert(receipt).select("id").maybeSingle();
    if(receiptError?.code==="23505")return response("Duplicate delivery ignored.");
    if(receiptError||!saved)return response("Webhook temporarily unavailable.",503);
    const translated=translateStripeEvent(event,{organisationId:integration.organisation_id,integrationId:integration.id,receivedAt:new Date().toISOString()},mode);
    if(!translated){await db.from("stripe_event_receipts").update({processing_status:"ignored",processed_at:new Date().toISOString()}).eq("id",saved.id);return response("Unsupported event ignored.")}
    const{error:eventError}=await db.from("events").insert({organisation_id:translated.organisationId,integration_id:translated.integrationId??null,source:translated.source,category:translated.category,event_type:translated.eventType,title:translated.title,description:translated.description??null,severity:translated.severity,occurred_at:translated.occurredAt,external_id:translated.externalId??null,raw_payload:(translated.rawPayload??{}) as Json,metadata:(translated.metadata??{}) as Json});
    if(eventError&&eventError.code!=="23505"){await db.from("stripe_event_receipts").update({processing_status:"failed",error_category:"database"}).eq("id",saved.id);return response("Webhook temporarily unavailable.",503)}
    const now=new Date().toISOString(),settings={...(integration.settings as Record<string,Json>),lastWebhookAt:now};
    await Promise.all([db.from("stripe_event_receipts").update({processing_status:"processed",processed_at:now}).eq("id",saved.id),db.from("integrations").update({settings}).eq("id",integration.id).eq("organisation_id",integration.organisation_id)]);
    return response(eventError?"Duplicate event ignored.":"Processed.");
  }catch{return response("Webhook temporarily unavailable.",503)}
}
