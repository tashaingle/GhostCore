export type StripeErrorKind="unauthorized"|"forbidden"|"not_found"|"conflict"|"rate_limit"|"timeout"|"provider"|"malformed";
export class GhostStripeError extends Error{constructor(public kind:StripeErrorKind,message:string){super(message);this.name="GhostStripeError"}}
export function safeStripeError(error:unknown){
  const value=error as{statusCode?:number;code?:string;type?:string;message?:string;rawType?:string};
  const detail=typeof value?.message==="string"&&value.message.trim()?value.message.trim().slice(0,240):undefined;
  if(value?.statusCode===401||value?.code==="account_invalid")return new GhostStripeError("unauthorized",detail??"Stripe access was revoked or expired. Reconnect the account.");
  if(value?.statusCode===403)return new GhostStripeError("forbidden",detail??"Stripe denied the requested operation. Check test/live mode matches.");
  if(value?.statusCode===404)return new GhostStripeError("not_found",detail??"The Stripe resource is no longer available.");
  if(value?.statusCode===409)return new GhostStripeError("conflict",detail??"Stripe reported a temporary conflict. Try again.");
  if(value?.statusCode===429)return new GhostStripeError("rate_limit",detail??"Stripe rate limited this sync. Try again later.");
  if(value?.code==="ETIMEDOUT"||value?.type==="StripeConnectionError")return new GhostStripeError("timeout",detail??"Stripe did not respond before the request timed out.");
  // Common mode mismatch: platform sk_test_* talking to a live connected account, or vice versa.
  if(detail&&/livemode|test mode|no such|account/i.test(detail)){
    return new GhostStripeError("provider",`${detail} If you just connected Stripe, reconnect using the same test/live mode as STRIPE_PLATFORM_SECRET_KEY.`);
  }
  return new GhostStripeError("provider",detail??"Stripe could not complete the request.");
}
