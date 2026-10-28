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
  testing_status: z.enum(["testing", "invited", "paused", "completed", "not_testing", "not_confirmed"]),
  review_rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  testing_review: z.string().trim().max(2000).optional(),
});

const feedback = z.object({
  id: z.string().uuid(),
  testing_status: z.enum(["testing", "invited", "paused", "completed", "not_testing", "not_confirmed"]),
  review_rating: z.coerce.number().int().min(1).max(5).optional().or(z.literal("")),
  testing_review: z.string().trim().max(2000).optional(),
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
    testing_status: form.get("testing_status"),
    review_rating: form.get("review_rating"),
    testing_review: form.get("testing_review"),
  });
  if (!parsed.success) finish("error", "Check the contact details and try again.");
  const ctx = await getActiveOrganisation();
  const {error} = await ctx.supabase.from("email_contacts").insert({
    organisation_id: ctx.organisation.id,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    source: parsed.data.source,
    platform: parsed.data.platform,
    testing_status: parsed.data.testing_status,
    review_rating: parsed.data.review_rating === "" ? null : parsed.data.review_rating,
    testing_review: parsed.data.testing_review || null,
    created_by: ctx.user.id,
  });
  if (error) finish("error", "That contact couldn't be added.");
  revalidatePath("/app/email-list");
  finish("success", "Contact added.");
}

export async function updateEmailContactFeedback(form: FormData) {
  const parsed = feedback.safeParse({
    id: form.get("id"),
    testing_status: form.get("testing_status"),
    review_rating: form.get("review_rating"),
    testing_review: form.get("testing_review"),
  });
  if (!parsed.success) finish("error", "Check the testing details and try again.");
  const ctx = await getActiveOrganisation();
  const {error} = await ctx.supabase
    .from("email_contacts")
    .update({
      testing_status: parsed.data.testing_status,
      review_rating: parsed.data.review_rating === "" ? null : parsed.data.review_rating,
      testing_review: parsed.data.testing_review || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organisation_id", ctx.organisation.id);
  if (error) finish("error", "Those testing details couldn't be saved.");
  revalidatePath("/app/email-list");
  finish("success", "Testing details updated.");
}
