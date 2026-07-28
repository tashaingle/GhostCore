import { z } from "zod";
import { EVENT_CATEGORIES, EVENT_SEVERITIES } from "@/types/events";
const value = (v: string|string[]|undefined) => Array.isArray(v) ? v[0] : v;
export function parseEventFilters(params: Record<string,string|string[]|undefined>) {
  return z.object({
    severity:z.enum(EVENT_SEVERITIES).optional(), category:z.enum(EVENT_CATEGORIES).optional(),
    source:z.string().trim().max(80).optional(), q:z.string().trim().max(100).optional(),
    period:z.enum(["7d","30d","90d","all"]).default("30d"),
    page:z.coerce.number().int().min(1).max(1000).default(1),
  }).parse({ severity:value(params.severity)||undefined, category:value(params.category)||undefined,
    source:value(params.source)||undefined, q:value(params.q)||undefined, period:value(params.period)||undefined, page:value(params.page)||undefined });
}
export function periodStart(period:"7d"|"30d"|"90d", now = new Date()) {
  return new Date(now.getTime()-Number(period.slice(0,-1))*86400000).toISOString();
}
