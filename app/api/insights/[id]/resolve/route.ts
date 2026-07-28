import {transitionInsightApi} from "@/lib/intelligence/api-transition";
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){return transitionInsightApi((await params).id,"resolve")}
