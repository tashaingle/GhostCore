import Link from "next/link";
import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {updateInsightStatus} from "@/app/intelligence-actions";
import {Notice} from "@/components/notice";
export default async function InsightDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const [{id},query,ctx]=await Promise.all([params,searchParams,getActiveOrganisation()]);if(!ctx)return null;
  const{data:insight}=await ctx.supabase.from("insights").select("*").eq("id",id).eq("organisation_id",ctx.organisation.id).maybeSingle();if(!insight)notFound();
  const evidence=insight.source_event_ids.length?(await ctx.supabase.from("events").select("id,source,event_type,title,description,severity,occurred_at").eq("organisation_id",ctx.organisation.id).in("id",insight.source_event_ids)).data??[]:[];
  return <section className="space-y-6"><Link className="text-sm text-zinc-600" href="/app/timeline">← Back to timeline</Link><Notice searchParams={query}/>
    <article className="card border-violet-200"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-800">Insight</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs uppercase">{insight.severity}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{insight.status}</span></div><h2 className="mt-4 text-2xl font-bold">{insight.title}</h2><p className="mt-2 text-zinc-700">{insight.summary}</p><p className="mt-4 text-3xl font-semibold">{insight.confidence}% <span className="text-sm font-normal text-zinc-500">confidence</span></p></article>
    <div className="grid gap-4 md:grid-cols-2"><article className="card"><h3 className="font-semibold">Why Ghost surfaced this</h3><p className="mt-2 text-sm text-zinc-700">{insight.explanation}</p></article><article className="card"><h3 className="font-semibold">Recommendation</h3><p className="mt-2 text-sm text-zinc-700">{insight.recommendation}</p></article></div>
    <div className="flex flex-wrap gap-2">{(["acknowledge","dismiss","resolve"] as const).map(action=><form action={updateInsightStatus} key={action}><input type="hidden" name="id" value={insight.id}/><input type="hidden" name="action" value={action}/><button className={action==="acknowledge"?"button":"button button-secondary"} disabled={insight.status==="resolved"||insight.status==="dismissed"}>{action[0].toUpperCase()+action.slice(1)}</button></form>)}</div>
    <div><h3 className="text-lg font-semibold">Supporting evidence</h3><div className="mt-3 space-y-3">{evidence.map(event=><article className="card" key={event.id}><div className="flex gap-2"><strong>{event.title}</strong><time className="ml-auto text-xs text-zinc-500">{new Date(event.occurred_at).toLocaleString()}</time></div>{event.description&&<p className="mt-2 text-sm">{event.description}</p>}<p className="mt-2 text-xs text-zinc-500">{event.source} · {event.event_type}</p></article>)}</div></div>
  </section>;
}
