import{z}from"zod";
export const recurrenceScheduleSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("interval"),minutes:z.number().int().min(15).max(525600)}),
 z.object({type:z.literal("daily"),hour:z.number().int().min(0).max(23).default(9),minute:z.number().int().min(0).max(59).default(0)}),
 z.object({type:z.literal("weekly"),day:z.number().int().min(0).max(6),hour:z.number().int().min(0).max(23).default(9),minute:z.number().int().min(0).max(59).default(0)})
]);
export function nextOccurrence(after:Date,raw:unknown){const s=recurrenceScheduleSchema.parse(raw);if(s.type==="interval")return new Date(after.getTime()+s.minutes*60000);const next=new Date(after);next.setUTCSeconds(0,0);next.setUTCHours(s.hour,s.minute);if(s.type==="daily"){if(next<=after)next.setUTCDate(next.getUTCDate()+1);return next}const add=(s.day-next.getUTCDay()+7)%7;next.setUTCDate(next.getUTCDate()+add);if(next<=after)next.setUTCDate(next.getUTCDate()+7);return next}
