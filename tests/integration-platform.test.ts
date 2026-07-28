import {describe,expect,it,vi} from "vitest";
import {getProvider,hasCapability,providerRegistry,providers} from "@/lib/integrations/registry";
import {healthFromStatus} from "@/lib/integrations/health";
import {loadConnector} from "@/lib/integrations/loader";
import {completedLog,processConnectorBatch} from "@/lib/integrations/sync-runner";
import type {IntegrationConnector} from "@/lib/integrations/connector";
import type {NormalisedEventInput} from "@/types/events";
const context={organisationId:"11111111-1111-4111-8111-111111111111",integrationId:"22222222-2222-4222-8222-222222222222",receivedAt:"2026-07-28T00:00:00Z"};
const event:NormalisedEventInput={...context,source:"test",category:"other",eventType:"test.created",title:"Test",severity:"info",occurredAt:context.receivedAt};
class FakeConnector implements IntegrationConnector{
  provider="fake";connect=vi.fn(async()=>({ok:true}));disconnect=vi.fn(async()=>({ok:true}));refresh=vi.fn(async()=>({ok:true}));
  healthCheck=vi.fn(async()=>"healthy" as const);sync=vi.fn(async()=>({received:3,events:[event,event]}));
  translate(){return event}
}
describe("provider registry",()=>{
  it("is unique and complete",()=>{expect(providers).toHaveLength(11);expect(new Set(providers.map(provider=>provider.id)).size).toBe(providers.length);expect(getProvider("github")).toBe(providerRegistry.github)});
  it("declares capabilities and schedules",()=>{expect(hasCapability(providerRegistry.github,"oauth")).toBe(true);expect(providerRegistry.github.schedule).toBe("hourly");expect(hasCapability(providerRegistry.manual,"manual")).toBe(true);expect(providerRegistry.google_analytics.connector).toBe("google_analytics");expect(providerRegistry.google_analytics.propertySelection).toBe(true)});
});
describe("connector loading",()=>{
  it("loads GitHub and placeholder connectors",()=>{expect(loadConnector("github","token").provider).toBe("github");expect(loadConnector("slack").provider).toBe("slack")});
  it("rejects unknown providers",()=>expect(()=>loadConnector("unknown")).toThrow(/Unknown/));
});
it("maps all health states",()=>{expect(["connected","syncing","error","expired","disconnected","other"].map(healthFromStatus)).toEqual(["healthy","syncing","error","expired","disconnected","unknown"])});
it("sync runner counts imports, duplicates, unsupported records and errors",async()=>{
  const connector=new FakeConnector();const write=vi.fn().mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({ok:true,duplicate:true});
  await expect(processConnectorBatch(connector,context,write)).resolves.toEqual({received:3,imported:1,skipped:2,errors:0,rateLimited:false});
});
it("builds finished and partial log records",()=>{expect(completedLog({received:4,imported:2,skipped:1,errors:1,rateLimited:true},"2026-07-28T00:00:01Z",1000)).toEqual({status:"partial",finished_at:"2026-07-28T00:00:01Z",duration_ms:1000,records_received:4,events_imported:2,events_skipped:1,error_count:1,rate_limited:true})});
