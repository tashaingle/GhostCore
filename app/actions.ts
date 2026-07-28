"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { getActiveOrganisation } from "@/lib/organisations/active";
import { uniqueSlug } from "@/lib/organisations/slug";
import { parseJsonObject } from "@/lib/events/event-schema";
import { createEvent } from "@/lib/events/create-event";
import { createDemoEvents } from "@/lib/events/demo";
import { EVENT_CATEGORIES, EVENT_SEVERITIES, INTEGRATION_STATUSES, SUPPORTED_PROVIDERS } from "@/types/events";
import {requirePermission} from "@/lib/auth/permissions";

const messageUrl = (path:string, kind:"error"|"success", message:string) => `${path}?${kind}=${encodeURIComponent(message)}`;
export async function signIn(form:FormData) {
  const parsed = z.object({ email:z.email(), password:z.string().min(8) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(messageUrl("/login","error","Enter a valid email and password (at least 8 characters)."));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(messageUrl("/login","error","Sign-in failed. Check your credentials."));
  redirect("/app");
}
export async function signUp(form:FormData) {
  const parsed = z.object({ email:z.email(), password:z.string().min(8), fullName:z.string().trim().min(2).max(100) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(messageUrl("/register","error","Enter your name, a valid email, and a password of at least 8 characters."));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email:parsed.data.email, password:parsed.data.password,
    options:{ data:{ full_name:parsed.data.fullName }, emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback` } });
  if (error) redirect(messageUrl("/register","error","Registration failed. The account may already exist."));
  if (!data.session) redirect(messageUrl("/login","success","Check your email to confirm your account, then sign in."));
  redirect("/app");
}
export async function signOut() { const supabase=await createClient(); await supabase.auth.signOut(); redirect("/login"); }
export async function createOrganisation(form:FormData) {
  const name = z.string().trim().min(2).max(100).safeParse(form.get("name"));
  if (!name.success) redirect(messageUrl("/app/onboarding","error","Organisation name must be 2–100 characters."));
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_organisation_with_owner", { organisation_name:name.data, organisation_slug:uniqueSlug(name.data) });
  if (error) redirect(messageUrl("/app/onboarding","error","Could not create the organisation. Apply the Supabase migration and try again."));
  redirect("/app");
}
export async function addIntegration(form:FormData) {
  const schema=z.object({ provider:z.enum(SUPPORTED_PROVIDERS), accountName:z.string().trim().max(120), status:z.enum(INTEGRATION_STATUSES) });
  const parsed=schema.safeParse(Object.fromEntries(form)); if(!parsed.success) redirect(messageUrl("/app/integrations","error","Check the integration fields."));
  const ctx=await getActiveOrganisation(); if(!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role,"integration.manage");
  const { error }=await ctx.supabase.from("integrations").insert({ organisation_id:ctx.organisation.id, provider:parsed.data.provider, provider_account_name:parsed.data.accountName||null, status:parsed.data.status, settings:{} });
  if(error) redirect(messageUrl("/app/integrations","error","The integration could not be added."));
  revalidatePath("/app/integrations"); redirect(messageUrl("/app/integrations","success","Test integration added."));
}
export async function deleteIntegration(form:FormData) {
  const id=z.uuid().safeParse(form.get("id")); if(!id.success) return;
  const ctx=await getActiveOrganisation(); if(!ctx) return;
  requirePermission(ctx.membership.role,"integration.manage");
  await ctx.supabase.from("integrations").delete().eq("id",id.data).eq("organisation_id",ctx.organisation.id);
  revalidatePath("/app/integrations");
}
export async function createTestEvent(form:FormData) {
  const ctx=await getActiveOrganisation(); if(!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role,"event.create");
  try {
    const category=z.enum(EVENT_CATEGORIES).parse(form.get("category")); const severity=z.enum(EVENT_SEVERITIES).parse(form.get("severity"));
    const occurredAt=new Date(String(form.get("occurredAt"))).toISOString();
    const result=await createEvent(ctx.supabase,ctx.user.id,{ organisationId:ctx.organisation.id,
      integrationId:String(form.get("integrationId")||"")||null, source:String(form.get("source")||""),
      category,eventType:String(form.get("eventType")||""),title:String(form.get("title")||""),
      description:String(form.get("description")||"")||null,severity,occurredAt,
      externalId:String(form.get("externalId")||"")||null,
      metadata:parseJsonObject(String(form.get("metadata")||""),"Metadata"),
      rawPayload:parseJsonObject(String(form.get("rawPayload")||""),"Raw payload") });
    if(!result.ok) throw new Error(result.message);
    redirect(messageUrl("/app/timeline","success",result.duplicate?"That external event already exists; no duplicate was created.":"Event created."));
  } catch(error) {
    if(error && typeof error==="object" && "digest" in error) throw error;
    redirect(messageUrl("/app/developer","error",error instanceof Error?error.message:"Check the event fields."));
  }
}
export async function seedDemoEvents() {
  const ctx=await getActiveOrganisation(); if(!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role,"event.create");
  let created=0;
  for(const event of createDemoEvents(ctx.organisation.id)) { const result=await createEvent(ctx.supabase,ctx.user.id,event); if(result.ok&&!result.duplicate) created++; }
  revalidatePath("/app"); redirect(messageUrl("/app/timeline","success",created?`${created} demo events created.`:"Demo events already exist; no duplicates were created."));
}
