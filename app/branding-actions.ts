"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";

const optionalUrl = z.union([z.literal(""), z.url().startsWith("https://")]);
const schema = z.object({
  organisationId: z.uuid(),
  primaryLogoUrl: optionalUrl,
  secondaryLogoUrl: optionalUrl,
  iconUrl: optionalUrl,
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  headingFont: z.string().trim().min(1).max(100),
  bodyFont: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(5000),
});

export async function saveBranding(form: FormData) {
  const parsed = schema.safeParse({
    organisationId: form.get("organisationId"),
    primaryLogoUrl: form.get("primaryLogoUrl"),
    secondaryLogoUrl: form.get("secondaryLogoUrl"),
    iconUrl: form.get("iconUrl"),
    primaryColor: form.get("primaryColor"),
    secondaryColor: form.get("secondaryColor"),
    accentColor: form.get("accentColor"),
    headingFont: form.get("headingFont"),
    bodyFont: form.get("bodyFont"),
    notes: form.get("notes"),
  });
  if (!parsed.success) redirect("/app/branding?error=Check%20the%20brand%20details%20and%20try%20again.");
  const ctx = await getActiveOrganisation();
  const project = ctx.organisations.find((item) => item.id === parsed.data.organisationId);
  if (!project || !hasPermission(project.role as OrganisationRole, "work.manage"))
    redirect("/app/branding?error=You%20cannot%20edit%20that%20brand.");
  const {error} = await ctx.supabase.from("organisation_branding").upsert({
    organisation_id: project.id,
    primary_logo_url: parsed.data.primaryLogoUrl || null,
    secondary_logo_url: parsed.data.secondaryLogoUrl || null,
    icon_url: parsed.data.iconUrl || null,
    primary_color: parsed.data.primaryColor.toLowerCase(),
    secondary_color: parsed.data.secondaryColor.toLowerCase(),
    accent_color: parsed.data.accentColor.toLowerCase(),
    heading_font: parsed.data.headingFont,
    body_font: parsed.data.bodyFont,
    notes: parsed.data.notes,
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  }, {onConflict: "organisation_id"});
  if (error) redirect(`/app/branding?project=${project.id}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/app/branding");
  redirect(`/app/branding?project=${project.id}&success=Brand%20library%20updated.`);
}
