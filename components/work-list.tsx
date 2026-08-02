import Link from"next/link";
import{WorkStatus}from"./work-status";
import{sortUnifiedWork}from"@/lib/work/status";
import type{UnifiedWork}from"@/lib/work/types";
type Item=UnifiedWork&{assignee:string|null;owner:string|null;caseNumber?:string|null;sourceType:string;checklist?:string;blockers?:number;watchers?:number;updatedAt:string};
export function WorkList({items}:{items:Item[]}){
 const sorted=sortUnifiedWork(items) as Item[];
 if(!sorted.length)return <div className="card text-zinc-500">No operational work matches these deterministic filters.</div>;
 return <div className="overflow-auto rounded-xl border bg-white"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Work</th><th>Status</th><th>Due</th><th>Assignee / owner</th><th>Source</th><th>Operational detail</th><th>Updated</th></tr></thead><tbody>{sorted.map(x=><tr className="border-b align-top" key={`${x.kind}:${x.id}`}><td className="p-3"><Link className="font-semibold hover:underline" href={`/app/${x.kind==="task"?"tasks":"cases"}/${x.id}`}>{x.kind==="case"&&x.caseNumber?<span className="mr-2 text-zinc-500">{x.caseNumber}</span>:null}{x.title}</Link><p className="capitalize text-xs text-zinc-500">{x.kind}</p></td><td><WorkStatus status={x.status} priority={x.priority}/></td><td>{x.dueAt?<time dateTime={x.dueAt}>{new Date(x.dueAt).toLocaleString()}</time>:"No due date"}</td><td>{x.assignee??"Unassigned"}<p className="text-xs text-zinc-500">Owner: {x.owner??"None"}</p></td><td className="capitalize">{x.sourceType.replaceAll("_"," ")}</td><td>{x.checklist??(x.kind==="case"?"Case record":"No checklist")}<p className="text-xs text-zinc-500">{x.blockers??0} blockers · {x.watchers??0} watchers</p></td><td>{new Date(x.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>
}
