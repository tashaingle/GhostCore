export type TimelineItem={id:string;kind:"event"|"insight";title:string;summary:string|null;severity:string;timestamp:string;href?:string;label:string};
export function mergeTimelineItems(events:TimelineItem[],insights:TimelineItem[],limit=50){return[...events,...insights].sort((a,b)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()).slice(0,limit)}
