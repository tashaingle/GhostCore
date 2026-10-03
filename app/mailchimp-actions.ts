"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requirePermission} from "@/lib/auth/permissions";
import type {Json} from "@/types/database";

export async function saveMailchimpAudiences(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "integration.manage");
  const id = z.uuid().safeParse(form.get("integrationId"));
  if (!id.success) return;
  const {data} = await ctx.supabase
    .from("integrations")
    .select("settings")
    .eq("id", id.data)
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "mailchimp")
    .maybeSingle();
  if (!data) redirect("/app/integrations?error=That%20Mailchimp%20account%20no%20longer%20exists.");
  const settings = (data.settings ?? {}) as Record<string, Json>,
    ticked = new Set(form.getAll("audience").map(String)),
    audiences = Array.isArray(settings.audiences)
      ? settings.audiences.map((a) => {
          const audience = a as {id: string; name: string};
          return {...audience, selected: ticked.has(audience.id)};
        })
      : [];
  await ctx.supabase
    .from("integrations")
    .update({settings: {...settings, audiences}})
    .eq("id", id.data)
    .eq("organisation_id", ctx.organisation.id);
  revalidatePath("/app/integrations");
  redirect(
    `/app/integrations/mailchimp/settings?${ticked.size ? "success=Saved." : "error=Nothing%20is%20ticked%2C%20so%20Mailchimp%20won%E2%80%99t%20bring%20anything%20in."}`,
  );
}
