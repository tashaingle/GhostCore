import{beforeEach,describe,expect,it}from"vitest";
import{providerRegistry}from"@/lib/integrations/registry";
import{META_BREAKDOWNS,META_DEFAULT_VERSION,META_PERMISSIONS}from"@/lib/integrations/meta-ads/config";
import{allowedBreakdowns,decimalToMicros,normaliseActions,preferredAction,PURCHASE_PRECEDENCE}from"@/lib/integrations/meta-ads/metrics";
import{authorisationUrl,stateMatches}from"@/lib/integrations/meta-ads/oauth";
import{metaFingerprint,translateMeta}from"@/lib/integrations/meta-ads/translator";
import type{MetaInsight}from"@/lib/integrations/meta-ads/types";
beforeEach(()=>{process.env.META_APP_ID="app";process.env["META_"+"APP_SECRET"]="test-secret";process.env.META_REDIRECT_URI="http://localhost:3000/api/integrations/meta-ads/callback";delete process.env.META_GRAPH_API_VERSION});
const ctx={organisationId:"org-a",integrationId:"integration-a",receivedAt:"2026-07-29T00:00:00Z"};
const insight:MetaInsight={kind:"insight",level:"account",accountId:"123",entityId:"123",dateStart:"2026-07-27",dateStop:"2026-07-27",currency:"GBP",timezone:"Europe/London",spend:"12.345678",impressions:"1000",reach:"800",clicks:"40",inlineLinkClicks:"30",actions:[{action_type:"purchase",value:"2"},{action_type:"omni_purchase",value:"3"},{action_type:"lead",value:"4"}],actionValues:[{action_type:"omni_purchase",value:"90.50"}],purchaseRoas:[{action_type:"omni_purchase",value:"7.33"}],attributionWindows:["7d_click","1d_view"]};
describe("Meta Ads registration and OAuth",()=>{
  it("is a real read-only provider",()=>{expect(providerRegistry.meta_ads.connector).toBe("meta_ads");expect(providerRegistry.meta_ads.category).toBe("Advertising");expect(providerRegistry.meta_ads.capabilities).toContain("read_only")});
  it("requests only approved permissions",()=>{expect(META_PERMISSIONS).toEqual(["ads_read","business_management"]);expect(META_PERMISSIONS.join()).not.toMatch(/ads_management|write/i)});
  it("uses configurable v25 default",()=>expect(META_DEFAULT_VERSION).toBe("v25.0"));
  it("builds versioned OAuth without a secret",()=>{const url=authorisationUrl("state");expect(url).toContain("/v25.0/dialog/oauth");expect(url).not.toContain("secret");expect(url).toContain("ads_read")});
  it("validates state exactly",()=>{expect(stateMatches("same","same")).toBe(true);expect(stateMatches("same","other")).toBe(false)});
});
describe("Meta action and decimal normalisation",()=>{
  it("handles malformed actions",()=>expect(normaliseActions([{action_type:"bad",value:"nope"}])).toEqual({}));
  it("uses purchase precedence",()=>expect(preferredAction(normaliseActions(insight.actions),PURCHASE_PRECEDENCE)).toEqual({type:"omni_purchase",value:"3"}));
  it("preserves six-place spend",()=>expect(decimalToMicros("12.345678")).toBe("12345678"));
  it("rejects unsafe breakdowns",()=>{expect(allowedBreakdowns(["country"])).toEqual(["country"]);expect(()=>allowedBreakdowns(["age"])).toThrow();expect(()=>allowedBreakdowns(["country","device_platform"])).toThrow();expect(META_BREAKDOWNS).toContain("publisher_platform")});
});
describe("Meta deterministic events",()=>{
  it("retains attribution and canonical metrics",()=>{const event=translateMeta(insight,ctx,metaFingerprint(insight)),metrics=event.metadata?.metrics as Record<string,unknown>;expect(metrics).toMatchObject({spend:"12.345678",spendMicros:"12345678",attributedPurchases:"3",attributedPurchaseValue:"90.50"});expect(event.metadata?.attribution).toEqual({windows:["7d_click","1d_view"],source:"Meta unified attribution"})});
  it("is organisation scoped",()=>{const revision=metaFingerprint(insight);expect(translateMeta(insight,ctx,revision).externalId).not.toBe(translateMeta(insight,{...ctx,organisationId:"org-b"},revision).externalId)});
  it("contains no secret evidence",()=>{const text=JSON.stringify(translateMeta(insight,ctx,metaFingerprint(insight)));expect(text).not.toContain("access_token");expect(text).not.toContain("app_secret")});
  it("maps campaign state factually",()=>{const event=translateMeta({kind:"campaign",id:"c1",accountId:"123",name:"Summer",status:"PAUSED",effectiveStatus:"PAUSED",updatedTime:"2026-07-29T10:00:00Z"},ctx,"revision");expect(event.eventType).toBe("meta_ads.campaign.updated");expect(event.title).toContain("PAUSED")});
});
