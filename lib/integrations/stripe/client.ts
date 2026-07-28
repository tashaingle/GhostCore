import "server-only";
import Stripe from "stripe";
import {STRIPE_API_VERSION,STRIPE_MAX_EVENTS,STRIPE_MAX_PAGES,STRIPE_MAX_RUNTIME_MS,STRIPE_SUPPORTED_EVENTS,stripeEnvironment} from "./config";
import {safeStripeError} from "./errors";

export function stripeClient(secretKey?:string){return new Stripe(secretKey??stripeEnvironment().secretKey,{apiVersion:STRIPE_API_VERSION,maxNetworkRetries:2,timeout:15_000,telemetry:false})}
export type StripeEventPage={events:Stripe.Event[];pages:number;truncated:boolean};
export async function listStripeEvents(accountId:string,createdGte:number):Promise<StripeEventPage>{
  const client=stripeClient(),events:Stripe.Event[]=[];let startingAfter:string|undefined,pages=0,truncated=false;const started=Date.now();
  try{
    while(pages<STRIPE_MAX_PAGES&&events.length<STRIPE_MAX_EVENTS&&Date.now()-started<STRIPE_MAX_RUNTIME_MS){
      const page=await client.events.list({created:{gte:createdGte},limit:100,types:[...STRIPE_SUPPORTED_EVENTS],...(startingAfter?{starting_after:startingAfter}:{})}, {stripeAccount:accountId});
      pages++;events.push(...page.data);if(!page.has_more||!page.data.length)break;
      startingAfter=page.data.at(-1)?.id;
      if(!startingAfter)break;
    }
    truncated=pages>=STRIPE_MAX_PAGES||events.length>=STRIPE_MAX_EVENTS||Date.now()-started>=STRIPE_MAX_RUNTIME_MS;
    return{events:events.slice(0,STRIPE_MAX_EVENTS),pages,truncated};
  }catch(error){throw safeStripeError(error)}
}
