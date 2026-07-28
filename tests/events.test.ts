import { describe,expect,it } from "vitest"; import { normaliseEvent } from "@/lib/events/normalise-event"; import { eventInputSchema } from "@/lib/events/event-schema"; import { createDemoEvents } from "@/lib/events/demo";
import {isDuplicateEventError} from "@/lib/events/create-event";
const org="11111111-1111-4111-8111-111111111111";
it("validates and normalises events",()=>{const e=normaliseEvent({organisationId:org,source:" Manual ",category:"other",eventType:"Test.Created",title:" Test ",severity:"info",occurredAt:"2026-01-01T12:00:00+00:00"});expect(e.source).toBe("manual");expect(e.eventType).toBe("test.created");expect(e.rawPayload).toEqual({})});
it("rejects invalid events",()=>expect(eventInputSchema.safeParse({}).success).toBe(false));
describe("demo data",()=>it("is deterministic and complete",()=>{const a=createDemoEvents(org,new Date("2026-01-02T00:00:00Z"));const b=createDemoEvents(org,new Date("2026-01-02T00:00:00Z"));expect(a).toEqual(b);expect(a).toHaveLength(8);expect(new Set(a.map(x=>x.externalId)).size).toBe(8)}));
it("recognises concurrent unique-index duplicates",()=>{expect(isDuplicateEventError({code:"23505"})).toBe(true);expect(isDuplicateEventError({code:"42501"})).toBe(false)});
