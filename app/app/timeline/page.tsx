import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {parseEventFilters,periodStart} from "@/lib/events/filters";
import {EVENT_CATEGORIES,EVENT_SEVERITIES} from "@/types/events";
import {Notice} from "@/components/notice";
import {mergeTimelineItems,type TimelineItem} from "@/lib/intelligence/timeline";
const PAGE=25;
export default async function Timeline({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams,filters=parseEventFilters(params),ctx=await getActiveOrganisation();if(!ctx)return null;
  const rawView=typeof params.view==="string"?params.view:"everything",view=["events","insights","everything"].includes(rawView)?rawView:"everything";
  let eventQuery=ctx.supabase.from("events").select("id,source,category,event_type,title,description,severity,occurred_at").eq("organisation_id",ctx.organisation.id).order("occurred_at",{ascending:false}).limit(PAGE*(filters.page+1));
  if(filters.severity)eventQuery=eventQuery.eq("severity",filters.severity);if(filters.category)eventQuery=eventQuery.eq("category",filters.category);if(filters.source)eventQuery=eventQuery.ilike("source",`%${filters.source}%`);
  if(filters.q){const q=filters.q.replace(/[%(),]/g,"");eventQuery=eventQuery.or(`title.ilike.%${q}%,description.ilike.%${q}%`)}if(filters.period!=="all")eventQuery=eventQuery.gte("occurred_at",periodStart(filters.period));
  let insightQuery=ctx.supabase.from("insights").select("id,title,summary,severity,status,confidence,updated_at").eq("organisation_id",ctx.organisation.id).order("updated_at",{ascending:false}).limit(PAGE*(filters.page+1));
  if(filters.severity)insightQuery=insightQuery.eq("severity",filters.severity);if(filters.q){const q=filters.q.replace(/[%(),]/g,"");insightQuery=insightQuery.or(`title.ilike.%${q}%,summary.ilike.%${q}%`)}if(filters.period!=="all")insightQuery=insightQuery.gte("updated_at",periodStart(filters.period));
  const [eventsResult,insightsResult]=await Promise.all([view==="insights"?Promise.resolve({data:[],error:null}):eventQuery,view==="events"?Promise.resolve({data:[],error:null}):insightQuery]);
  const events:TimelineItem[]=(eventsResult.data??[]).map(event=>({id:event.id,kind:"event",title:event.title,summary:event.description,severity:event.severity,timestamp:event.occurred_at,label:`${event.source} · ${event.category} · ${event.event_type}`}));
  const insights:TimelineItem[]=(insightsResult.data??[]).map(insight=>({id:insight.id,kind:"insight",title:insight.title,summary:insight.summary,severity:insight.severity,timestamp:insight.updated_at,href:`/app/insights/${insight.id}`,label:`Insight · ${insight.status} · ${insight.confidence}% confidence`}));
  const merged=mergeTimelineItems(events,insights,PAGE*(filters.page+1)),items=merged.slice((filters.page-1)*PAGE,filters.page*PAGE),hasNext=merged.length>filters.page*PAGE;
  const url=(page:number)=>{const p=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(typeof v==="string")p.set(k,v)});p.set("page",String(page));return`?${p}`};
  return <section className="space-y-6"><div><h2 className="text-2xl font-bold">Timeline</h2><p className="text-zinc-600">Business events and intelligence, newest first.</p></div><Notice searchParams={params}/>
    <form className="card grid gap-3 md:grid-cols-7"><input className="field md:col-span-2" name="q" placeholder="Search" defaultValue={filters.q}/><input className="field" name="source" placeholder="Event source" defaultValue={filters.source}/>
      <select className="field" name="view" defaultValue={view}><option value="everything">Everything</option><option value="events">Events</option><option value="insights">Insights</option></select>
      <select className="field" name="severity" defaultValue={filters.severity??""}><option value="">All severities</option>{EVENT_SEVERITIES.map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" name="category" defaultValue={filters.category??""}><option value="">All event categories</option>{EVENT_CATEGORIES.map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" name="period" defaultValue={filters.period}><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="all">All time</option></select>
      <button className="button md:col-span-7 md:justify-self-start">Apply filters</button></form>
    {(eventsResult.error||insightsResult.error)?<p className="error">The timeline could not be loaded.</p>:!items.length?<div className="card text-zinc-500">Nothing matches these filters.</div>:<div className="space-y-3">{items.map(item=>{const card=<article className={`card ${item.kind==="insight"?"border-violet-200 bg-violet-50/30":""}`}><div className="flex flex-wrap items-center gap-2">{item.kind==="insight"&&<span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">Insight</span>}<span className="rounded-full bg-zinc-100 px-2 py-1 text-xs uppercase">{item.severity}</span><h3 className="font-semibold">{item.title}</h3><time className="ml-auto text-xs text-zinc-500">{new Date(item.timestamp).toLocaleString()}</time></div>{item.summary&&<p className="mt-2 text-sm text-zinc-700">{item.summary}</p>}<p className="mt-3 text-xs text-zinc-500">{item.label}</p></article>;return item.href?<Link className="block" href={item.href} key={`${item.kind}-${item.id}`}>{card}</Link>:<div key={`${item.kind}-${item.id}`}>{card}</div>})}</div>}
    <div className="flex justify-between text-sm">{filters.page>1?<Link href={url(filters.page-1)}>← Previous</Link>:<span/>}{hasNext&&<Link href={url(filters.page+1)}>Next →</Link>}</div>
  </section>;
}
