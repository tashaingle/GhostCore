import {describe,expect,it} from "vitest";
import {providerRegistry} from "@/lib/integrations/registry";
import {formatMinorAmount,translateStripeEvent} from "@/lib/integrations/stripe/translator";
import {newStripeState,stateDigest,stateMatches} from "@/lib/integrations/stripe/oauth";
import type Stripe from "stripe";
const event=(type:string,object:Record<string,unknown>,id="evt_1")=>({id,type,created:1_700_000_000,livemode:false,data:{object}}) as unknown as Stripe.Event;
const ctx={organisationId:"org_1",integrationId:"int_1",receivedAt:"2026-07-28T00:00:00Z"};
describe("Stripe provider",()=>{
  it("is available through the connector registry",()=>{expect(providerRegistry.stripe.connector).toBe("stripe");expect(providerRegistry.stripe.capabilities).toContain("read_only")});
  it("uses server OAuth and webhooks",()=>{expect(providerRegistry.stripe.connectPath).toBe("/api/integrations/stripe/connect");expect(providerRegistry.stripe.capabilities).toContain("webhooks")});
});
describe("Stripe OAuth state",()=>{
  it("creates unpredictable state and validates only its digest",()=>{const state=newStripeState();expect(state.length).toBeGreaterThan(30);expect(stateMatches(stateDigest(state),state)).toBe(true);expect(stateMatches(stateDigest(state),`${state}x`)).toBe(false)});
});
describe("Stripe translator",()=>{
  it("translates canonical successful payments",()=>{const out=translateStripeEvent(event("payment_intent.succeeded",{id:"pi_1",object:"payment_intent",amount_received:12500,currency:"gbp",customer:"cus_private"}),ctx,"test");expect(out?.eventType).toBe("stripe.payment_succeeded");expect(out?.metadata).toMatchObject({amountMinor:12500,currency:"gbp",displayAmount:"£125.00",mode:"test"});expect(JSON.stringify(out)).not.toContain("cus_private")});
  it("does not double count charge success",()=>expect(translateStripeEvent(event("charge.succeeded",{id:"ch_1",object:"charge",amount:500,currency:"gbp"}),ctx,"test")).toBeNull());
  it("isolates mode in external IDs",()=>{const test=translateStripeEvent(event("payment_intent.succeeded",{id:"pi_1",object:"payment_intent",amount:100,currency:"gbp"}),ctx,"test");const live=translateStripeEvent(event("payment_intent.succeeded",{id:"pi_1",object:"payment_intent",amount:100,currency:"gbp"}),ctx,"live");expect(test?.externalId).not.toBe(live?.externalId)});
  it("formats zero-decimal currencies without floating point aggregation",()=>expect(formatMinorAmount(12500,"jpy")).toContain("12,500"));
  it("handles partial refunds as integer minor units",()=>{const out=translateStripeEvent(event("refund.created",{id:"re_1",object:"refund",amount:375,currency:"gbp",payment_intent:"pi_1"}),ctx,"live");expect(out?.eventType).toBe("stripe.payment_refunded");expect(out?.metadata).toMatchObject({amountMinor:375,paymentId:"pi_1"})});
  it("maps failure and finance lifecycle facts",()=>{expect(translateStripeEvent(event("invoice.payment_failed",{id:"in_1",object:"invoice",amount:900,currency:"usd"}),ctx,"live")?.severity).toBe("critical");expect(translateStripeEvent(event("payout.paid",{id:"po_1",object:"payout",amount:5000,currency:"usd"}),ctx,"live")?.eventType).toBe("stripe.payout_paid")});
  it("ignores unsupported and malformed provider records",()=>{expect(translateStripeEvent(event("customer.updated",{id:"cus_1",object:"customer"}),ctx,"live")).toBeNull()});
  it("stores no email, metadata, address, card or bank data",()=>{const out=translateStripeEvent(event("payment_intent.payment_failed",{id:"pi_2",object:"payment_intent",amount:100,currency:"usd",customer:"cus_1",receipt_email:"person@example.com",metadata:{secret:"x"},payment_method:"pm_1"}),ctx,"live");const text=JSON.stringify(out);expect(text).not.toContain("person@example.com");expect(text).not.toContain("pm_1");expect(text).not.toContain("\"secret\"")});
});
