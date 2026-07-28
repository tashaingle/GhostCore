"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {runIntelligence} from "@/lib/intelligence/runner";
import {transitionInsight,type InsightAction} from "@/lib/intelligence/lifecycle";
import type {InsightStatus} from "@/lib/intelligence/types";
import {requirePermission} from "@/lib/auth/permissions";

export async function runIntelligenceAction(){
  const ctx=await getActiveOrganisation();if(!ctx)redirect("/app/onboarding");
  requirePermission(ctx.membership.role,"insight.manage");
  try{const result=await runIntelligence(ctx.supabase,ctx.organisation.id);revalidatePath("/app");revalidatePath("/app/timeline");redirect(`/app?success=${encodeURIComponent(`Intelligence complete: ${result.inserted} new, ${result.updated} updated, ${result.resolved} resolved.`)}`)}
  catch(error){if(error&&typeof error==="object"&&"digest"in error)throw error;redirect(`/app?error=${encodeURIComponent(error instanceof Error?error.message:"Intelligence failed.")}`)}
}
export async function updateInsightStatus(form:FormData){
  const id=String(form.get("id")??""),action=String(form.get("action")??"") as InsightAction;
  if(!id||!["acknowledge","dismiss","resolve"].includes(action))redirect("/app?error=Invalid%20insight%20action.");
  const ctx=await getActiveOrganisation();if(!ctx)redirect("/app/onboarding");
  requirePermission(ctx.membership.role,"insight.manage");
  const {data}=await ctx.supabase.from("insights").select("status").eq("id",id).eq("organisation_id",ctx.organisation.id).maybeSingle();
  if(!data)redirect("/app?error=Insight%20not%20found.");
  const status=transitionInsight(data.status as InsightStatus,action),now=new Date().toISOString();
  const timestamps=action==="acknowledge"?{acknowledged_at:now}:action==="dismiss"?{dismissed_at:now}:{resolved_at:now};
  const {error}=await ctx.supabase.from("insights").update({status,...timestamps,updated_at:now}).eq("id",id).eq("organisation_id",ctx.organisation.id);
  if(error)redirect(`/app/insights/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/app");revalidatePath("/app/timeline");revalidatePath(`/app/insights/${id}`);redirect(`/app/insights/${id}?success=Insight%20updated.`);
}
