import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {calculateInsightMetrics} from "@/lib/intelligence/dashboard";
import {runIntelligenceAction} from "@/app/intelligence-actions";
import {Notice} from "@/components/notice";

export default async function Overview({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams,ctx=await getActiveOrganisation();if(!ctx)return null;const orgId=ctx.organisation.id;
  const today=new Date();today.setHours(0,0,0,0);
  const [total,todayCount,connected,last,insightResult,searchResult]=await Promise.all([
    ctx.supabase.from("events").select("*",{count:"exact",head:true}).eq("organisation_id",orgId),
    ctx.supabase.from("events").select("*",{count:"exact",head:true}).eq("organisation_id",orgId).gte("occurred_at",today.toISOString()),
    ctx.supabase.from("integrations").select("*",{count:"exact",head:true}).eq("organisation_id",orgId).eq("status","connected"),
    ctx.supabase.from("events").select("occurred_at").eq("organisation_id",orgId).order("occurred_at",{ascending:false}).limit(1).maybeSingle(),
    ctx.supabase.from("insights").select("id,title,summary,severity,confidence,status,recommendation,resolved_at,updated_at").eq("organisation_id",orgId).order("updated_at",{ascending:false}).limit(100),
    ctx.supabase.from("events").select("integration_id,metadata,occurred_at").eq("organisation_id",orgId).eq("event_type","google_search_console.performance_summary").order("occurred_at",{ascending:false}).limit(50),
  ]);
  const insightRows=insightResult.data??[],metrics=calculateInsightMetrics(insightRows);
  const cards=[["Total events",total.count??0],["Events today",todayCount.count??0],["Connected integrations",connected.count??0],["Active insights",metrics.active],["Critical insights",metrics.critical],["Resolved today",metrics.resolvedToday],["Average confidence",`${metrics.averageConfidence}%`],["Last event",last.data?new Date(last.data.occurred_at).toLocaleString():"No events yet"]];
  const todaysInsights=insightRows.filter(row=>row.updated_at>=today.toISOString()&&["active","acknowledged"].includes(row.status)).slice(0,5);
  const latestSearch=[...new Map((searchResult.data??[]).map(row=>[`${row.integration_id}:${String((row.metadata as Record<string,unknown>).propertyUrl)}`,row])).values()];
  const searchTotals=latestSearch.reduce((sum,row)=>{const metadata=row.metadata as Record<string,unknown>,impressions=Number(metadata.impressions??0);return{clicks:sum.clicks+Number(metadata.clicks??0),impressions:sum.impressions+impressions,weightedPosition:sum.weightedPosition+Number(metadata.averagePosition??0)*impressions}},{clicks:0,impressions:0,weightedPosition:0});
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Overview</h2><p className="text-zinc-600">{ctx.organisation.name}</p></div><form action={runIntelligenceAction}><button className="button">Run intelligence</button></form></div>
    <Notice searchParams={params}/>
    {insightResult.error&&<p className="error">Insights are unavailable. Apply the latest Supabase migration.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value])=><article className="card" key={label}><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}</div>
    <article className="card"><p className="text-sm text-zinc-500">Top recommendation</p><p className="mt-2 font-medium">{metrics.topRecommendation}</p></article>
    {latestSearch.length>0&&<div><h3 className="text-xl font-semibold">Search Console</h3><p className="text-sm text-zinc-500">Latest complete API-backed period across selected properties.</p><div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Clicks",searchTotals.clicks],["Impressions",searchTotals.impressions],["CTR",searchTotals.impressions?`${(searchTotals.clicks/searchTotals.impressions*100).toFixed(1)}%`:"—"],["Average position",searchTotals.impressions?(searchTotals.weightedPosition/searchTotals.impressions).toFixed(1):"—"]].map(([label,value])=><article className="card" key={label}><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}</div></div>}
    <div><h3 className="text-xl font-semibold">Today&apos;s Insights</h3><p className="text-sm text-zinc-500">Deterministic findings produced from normalised events.</p></div>
    {!todaysInsights.length?<div className="card text-zinc-500">No active insights generated today.</div>:<div className="grid gap-3">{todaysInsights.map(insight=><Link className="card block hover:border-violet-300" href={`/app/insights/${insight.id}`} key={insight.id}><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">Insight</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs uppercase">{insight.severity}</span><strong>{insight.title}</strong><span className="ml-auto text-sm">{insight.confidence}% confidence</span></div><p className="mt-2 text-sm text-zinc-700">{insight.summary}</p></Link>)}</div>}
  </section>;
}
