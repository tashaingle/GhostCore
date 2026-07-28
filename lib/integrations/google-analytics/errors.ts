export type GoogleErrorKind="unauthorized"|"permission"|"rate_limit"|"api_disabled"|"not_found"|"network"|"malformed"|"configuration";
export class GoogleAnalyticsError extends Error{constructor(public kind:GoogleErrorKind,message:string,public code?:string){super(message)}}
export function googleOAuthCallbackMessage(code:string){if(code==="access_denied")return"Google Analytics consent was cancelled.";if(code==="redirect_uri_mismatch")return"Google rejected the configured redirect URI. Check the Google OAuth client and server environment.";return`Google authorization failed: ${code}`}
export async function googleApiResponse<T>(request:Promise<Response>):Promise<T>{
  let response:Response;try{response=await request}catch{throw new GoogleAnalyticsError("network","Google Analytics could not be reached.")}
  const body=await response.json().catch(()=>null) as {error?:{message?:string;status?:string;code?:number}}|null;
  if(response.ok&&body)return body as T;const message=body?.error?.message||`Google API returned ${response.status}.`;const status=body?.error?.status;
  if(response.status===401)throw new GoogleAnalyticsError("unauthorized","Google authorization has expired.","401");
  if(response.status===403&&/api.*not.*enabled|disabled/i.test(message))throw new GoogleAnalyticsError("api_disabled","The required Google Analytics API is not enabled.",status);
  if(response.status===403)throw new GoogleAnalyticsError("permission","The Google account cannot access this Analytics property.",status);
  if(response.status===404)throw new GoogleAnalyticsError("not_found","The selected Analytics property is unavailable.",status);
  if(response.status===429)throw new GoogleAnalyticsError("rate_limit","Google Analytics quota was reached. Try again later.",status);
  throw new GoogleAnalyticsError(body?"configuration":"malformed",message,status);
}
