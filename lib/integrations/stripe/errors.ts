export type StripeErrorKind="unauthorized"|"forbidden"|"not_found"|"conflict"|"rate_limit"|"timeout"|"provider"|"malformed";
export class GhostStripeError extends Error{constructor(public kind:StripeErrorKind,message:string){super(message);this.name="GhostStripeError"}}
export function safeStripeError(error:unknown){
  const value=error as{statusCode?:number;code?:string;type?:string};
  if(value?.statusCode===401)return new GhostStripeError("unauthorized","Stripe access was revoked or expired. Reconnect the account.");
  if(value?.statusCode===403)return new GhostStripeError("forbidden","Stripe denied the requested read-only operation.");
  if(value?.statusCode===404)return new GhostStripeError("not_found","The Stripe resource is no longer available.");
  if(value?.statusCode===409)return new GhostStripeError("conflict","Stripe reported a temporary conflict. Try again.");
  if(value?.statusCode===429)return new GhostStripeError("rate_limit","Stripe rate limited this sync. Try again later.");
  if(value?.code==="ETIMEDOUT"||value?.type==="StripeConnectionError")return new GhostStripeError("timeout","Stripe did not respond before the request timed out.");
  return new GhostStripeError("provider","Stripe could not complete the request.");
}
