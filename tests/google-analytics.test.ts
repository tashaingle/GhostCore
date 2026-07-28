import {describe,expect,it,vi} from "vitest";
import {codeChallenge,validateOAuthState} from "@/lib/integrations/google-analytics/oauth";
import {completeSevenDayRanges,dateInTimeZone} from "@/lib/integrations/google-analytics/dates";
import {compareMetric} from "@/lib/integrations/google-analytics/metrics";
import {validatePropertySelection} from "@/lib/integrations/google-analytics/property-discovery";
import {ga4ExternalId,translateGA4Snapshot} from "@/lib/integrations/google-analytics/translator";
import {GoogleAnalyticsClient} from "@/lib/integrations/google-analytics/client";
import {googleOAuthCallbackMessage} from "@/lib/integrations/google-analytics/errors";
import type {GA4Snapshot,MetricTotals} from "@/lib/integrations/google-analytics/schemas";
const totals=(sessions:number,keyEvents=10,engagementRate=.5):MetricTotals=>({activeUsers:sessions,newUsers:sessions/2,totalUsers:sessions,engagedSessions:sessions/2,averageSessionDuration:60,eventCount:sessions*3,screenPageViews:sessions*2,sessions,keyEvents,engagementRate});
const snapshot=(current=150,previous=100):GA4Snapshot=>({propertyId:"123456789",timeZone:"Europe/London",dates:{currentStart:"2026-07-20",currentEnd:"2026-07-26",previousStart:"2026-07-13",previousEnd:"2026-07-19",comparisonType:"rolling_7_day"},current:totals(current,15,.6),previous:totals(previous,10,.5),currentDimensions:[],previousDimensions:[]});
const context={organisationId:"11111111-1111-4111-8111-111111111111",integrationId:"22222222-2222-4222-8222-222222222222",receivedAt:"2026-07-27T00:00:00Z"};
describe("Google OAuth security",()=>{
  it("validates state using exact values",()=>{expect(validateOAuthState("abc","abc")).toBe(true);expect(validateOAuthState("abc","abd")).toBe(false);expect(validateOAuthState(undefined,"abc")).toBe(false)});
  it("creates the RFC 7636 challenge",()=>expect(codeChallenge("test-verifier")).toBe("JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0"));
  it("maps callback errors safely",()=>{expect(googleOAuthCallbackMessage("access_denied")).toMatch(/cancelled/);expect(googleOAuthCallbackMessage("redirect_uri_mismatch")).toMatch(/redirect URI/)});
});
describe("complete reporting dates",()=>{
  it("uses the property's local complete day",()=>{expect(dateInTimeZone(new Date("2026-07-28T00:30:00Z"),"America/Los_Angeles")).toBe("2026-07-27");expect(completeSevenDayRanges(new Date("2026-07-28T00:30:00Z"),"America/Los_Angeles")).toMatchObject({currentStart:"2026-07-20",currentEnd:"2026-07-26",previousStart:"2026-07-13",previousEnd:"2026-07-19"})});
});
it("normalises metric comparisons",()=>expect(compareMetric("sessions",totals(150),totals(100))).toEqual({metric:"sessions",currentValue:150,previousValue:100,absoluteChange:50,percentageChange:50}));
it("validates property selection against discovery",()=>{const properties=[{accountId:"1",accountName:"Acme",propertyId:"123",propertyName:"Web"}];expect(validatePropertySelection("123",properties)).toEqual(properties[0]);expect(()=>validatePropertySelection("456",properties)).toThrow(/not available/)});
describe("GA4 event rules",()=>{
  it("creates meaningful deterministic traffic events",()=>{const events=translateGA4Snapshot(snapshot(),context);expect(events).toContainEqual(expect.objectContaining({eventType:"analytics.traffic_increased",severity:"good"}));expect(ga4ExternalId(snapshot(),"analytics.traffic_increased","sessions")).toBe(ga4ExternalId(snapshot(),"analytics.traffic_increased","sessions"))});
  it("suppresses low-volume noise",()=>expect(translateGA4Snapshot(snapshot(20,10),context).filter(event=>event.eventType==="analytics.traffic_increased")).toHaveLength(0));
  it("detects robust inactivity",()=>expect(translateGA4Snapshot(snapshot(0,200),context)).toContainEqual(expect.objectContaining({eventType:"analytics.tracking_inactive",severity:"critical"})));
});
it("maps account summaries to GA4 properties",async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({accountSummaries:[{account:"accounts/1",displayName:"Acme",propertySummaries:[{property:"properties/123",displayName:"Website",propertyType:"PROPERTY_TYPE_ORDINARY"}]}]}),{status:200}));
  const client=new GoogleAnalyticsClient({accessToken:"token",expiresAt:"2099-01-01T00:00:00Z"},request);
  await expect(client.discoverProperties()).resolves.toEqual([{accountId:"1",accountName:"Acme",propertyId:"123",propertyName:"Website"}]);
});
it("refreshes expired access tokens without exposing credentials",async()=>{
  process.env.GOOGLE_CLIENT_ID="client";process.env.GOOGLE_CLIENT_SECRET="secret";process.env.GOOGLE_ANALYTICS_REDIRECT_URI="http://localhost:3000/auth/google-analytics/callback";
  const request=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:"new-token",expires_in:3600}),{status:200})).mockResolvedValueOnce(new Response(JSON.stringify({accountSummaries:[]}),{status:200}));
  const client=new GoogleAnalyticsClient({accessToken:"old",refreshToken:"refresh",expiresAt:"2020-01-01T00:00:00Z"},request);await client.discoverProperties();expect(client.credentialUpdate()).toMatchObject({accessToken:"new-token",refreshToken:"refresh"});
});
