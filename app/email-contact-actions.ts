"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";

const contact = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  source: z.string().trim().min(1).max(160),
  platform: z.enum(["ios", "android", "other", "unknown"]),
});

function finish(kind: "success" | "error", message: string): never {
  redirect(`/app/email-list?${kind}=${encodeURIComponent(message)}`);
}

export async function addEmailContact(form: FormData) {
  const parsed = contact.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    source: form.get("source"),
    platform: form.get("platform"),
  });
  if (!parsed.success) finish("error", "Check the contact details and try again.");
  const ctx = await getActiveOrganisation();
  const {error} = await ctx.supabase.from("email_contacts").insert({
    organisation_id: ctx.organisation.id,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    source: parsed.data.source,
    platform: parsed.data.platform,
    created_by: ctx.user.id,
  });
  if (error) finish("error", "That contact couldn't be added.");
  revalidatePath("/app/email-list");
  finish("success", "Contact added.");
}
