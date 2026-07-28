import "server-only";
import {googleOAuthEnv} from "./config";
import {GoogleAnalyticsError,googleApiResponse} from "./errors";
import type {ConnectorCredentialUpdate} from "../connector";
import type {DimensionRow,GA4Property,MetricTotals} from "./schemas";
type Credentials={accessToken:string;refreshToken?:string;expiresAt?:string};
type Report={dimensionHeaders?:{name:string}[];metricHeaders?:{name:string}[];rows?:{dimensionValues?:{value:string}[];metricValues?:{value:string}[]}[]};
const metricNames=["activeUsers","sessions","newUsers","totalUsers","engagedSessions","engagementRate","averageSessionDuration","eventCount","keyEvents","screenPageViews"] as const;
export class GoogleAnalyticsClient{
  private accessTokenValue:string;private expiresAt?:string;private refreshed?:ConnectorCredentialUpdate;
  constructor(private credentials:Credentials,private request:typeof fetch=fetch){this.accessTokenValue=credentials.accessToken;this.expiresAt=credentials.expiresAt}
  credentialUpdate(){return this.refreshed}
  private async token(){
    if(!this.expiresAt||new Date(this.expiresAt).getTime()>Date.now()+60000)return this.accessTokenValue;
    if(!this.credentials.refreshToken)throw new GoogleAnalyticsError("unauthorized","Google refresh token is missing. Reauthorise Google Analytics.");
    const env=googleOAuthEnv();const response=await this.request("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.clientId,client_secret:env.clientSecret,grant_type:"refresh_token",refresh_token:this.credentials.refreshToken})});
    const body=await response.json() as {access_token?:string;expires_in?:number;error?:string;error_description?:string};
    if(!response.ok||!body.access_token)throw new GoogleAnalyticsError("unauthorized",body.error_description||"Google authorization could not be refreshed.",body.error);
    this.accessTokenValue=body.access_token;this.expiresAt=new Date(Date.now()+(body.expires_in??3600)*1000).toISOString();this.refreshed={accessToken:this.accessTokenValue,refreshToken:this.credentials.refreshToken,expiresAt:this.expiresAt};return this.accessTokenValue;
  }
  private async get<T>(url:string){const token=await this.token();return googleApiResponse<T>(this.request(url,{headers:{Authorization:`Bearer ${token}`}}))}
  private async post<T>(url:string,body:unknown){const token=await this.token();return googleApiResponse<T>(this.request(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)}))}
  async discoverProperties():Promise<GA4Property[]>{
    const data=await this.get<{accountSummaries?:{account:string;displayName:string;propertySummaries?:{property:string;displayName:string;propertyType?:string}[]}[]}>("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
    return(data.accountSummaries??[]).flatMap(account=>(account.propertySummaries??[]).filter(property=>!property.propertyType||property.propertyType==="PROPERTY_TYPE_ORDINARY").map(property=>({accountId:account.account.replace("accounts/",""),accountName:account.displayName,propertyId:property.property.replace("properties/",""),propertyName:property.displayName})));
  }
  async property(propertyId:string){const data=await this.get<{name:string;displayName:string;timeZone:string;account:string}>(`https://analyticsadmin.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}`);return{accountId:data.account?.replace("accounts/","")??"",accountName:"",propertyId:data.name.replace("properties/",""),propertyName:data.displayName,timeZone:data.timeZone||"UTC"}}
  private runReport(propertyId:string,startDate:string,endDate:string,dimensions:string[]=[]){return this.post<Report>(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,{dateRanges:[{startDate,endDate}],dimensions:dimensions.map(name=>({name})),metrics:metricNames.map(name=>({name})),limit:dimensions.length?1000:10,keepEmptyRows:false})}
  private totals(report:Report):MetricTotals{const values=report.rows?.[0]?.metricValues?.map(value=>Number(value.value)||0)??[];return Object.fromEntries(metricNames.map((name,index)=>[name,values[index]??0])) as unknown as MetricTotals}
  private dimensions(report:Report):DimensionRow[]{return(report.rows??[]).map(row=>({channel:row.dimensionValues?.[0]?.value||"(not set)",sourceMedium:row.dimensionValues?.[1]?.value||"(not set)",landingPage:row.dimensionValues?.[2]?.value||"(not set)",sessions:Number(row.metricValues?.[1]?.value)||0,keyEvents:Number(row.metricValues?.[8]?.value)||0}))}
  async reports(propertyId:string,dates:{currentStart:string;currentEnd:string;previousStart:string;previousEnd:string}){
    const dimensions=["sessionDefaultChannelGroup","sessionSourceMedium","landingPagePlusQueryString"];
    const [current,previous,currentDimensions,previousDimensions]=await Promise.all([this.runReport(propertyId,dates.currentStart,dates.currentEnd),this.runReport(propertyId,dates.previousStart,dates.previousEnd),this.runReport(propertyId,dates.currentStart,dates.currentEnd,dimensions),this.runReport(propertyId,dates.previousStart,dates.previousEnd,dimensions)]);
    return{current:this.totals(current),previous:this.totals(previous),currentDimensions:this.dimensions(currentDimensions),previousDimensions:this.dimensions(previousDimensions)};
  }
  async revoke(){const token=await this.token();try{await this.request(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"}})}catch{}}
}
