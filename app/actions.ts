"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {requireUser} from "@/lib/auth/user";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {uniqueSlug} from "@/lib/organisations/slug";
import {parseJsonObject} from "@/lib/events/event-schema";
import {createEvent} from "@/lib/events/create-event";
import {createDemoEvents} from "@/lib/events/demo";
import {
  EVENT_CATEGORIES,
  EVENT_SEVERITIES,
  INTEGRATION_STATUSES,
  SUPPORTED_PROVIDERS,
} from "@/types/events";
import {requirePermission} from "@/lib/auth/permissions";
import {safeNext} from "@/lib/auth/next";
import {after} from "next/server";
import {hasAccess} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, syncOrganisationCount} from "@/lib/billing/stripe";

const messageUrl = (path: string, kind: "error" | "success", message: string) =>
  `${path}?${kind}=${encodeURIComponent(message)}`;
// Keeps "?next=" on the form's own page when sending someone back with an error.
const withNext = (path: string, next: string | null) =>
  next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;

export async function signIn(form: FormData) {
  const next = form.get("next") ? safeNext(form.get("next")) : null;
  const parsed = z
    .object({email: z.email(), password: z.string().min(8)})
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    redirect(
      withNext(
        messageUrl("/login", "error", "Enter a valid email and password (at least 8 characters)."),
        next,
      ),
    );
  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithPassword(parsed.data);
  if (error)
    redirect(
      withNext(
        messageUrl("/login", "error", "That email and password don't match. Please try again."),
        next,
      ),
    );
  redirect(next ?? "/app");
}
export async function signUp(form: FormData) {
  const next = form.get("next") ? safeNext(form.get("next")) : null;
  const parsed = z
    .object({
      email: z.email(),
      password: z.string().min(8),
      fullName: z.string().trim().min(2).max(100),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    redirect(
      withNext(
        messageUrl(
          "/register",
          "error",
          "Enter your name, a valid email, and a password of at least 8 characters.",
        ),
        next,
      ),
    );
  const supabase = await createClient();
  const {data, error} = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {full_name: parsed.data.fullName},
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=${encodeURIComponent(next ?? "/welcome")}`,
    },
  });
  if (error)
    redirect(
      withNext(
        messageUrl(
          "/register",
          "error",
          "Your account couldn't be created. You may already have one, so try signing in.",
        ),
        next,
      ),
    );
  // Supabase answers a sign-up for an existing address with a user that has no identities and
  // sends no email, so say so rather than leaving them waiting for an email that never comes.
  if (data.user && !data.user.identities?.length)
    redirect(
      withNext(
        messageUrl(
          "/login",
          "error",
          next?.startsWith("/invite/")
            ? "This email already has a Metric Mage account. Sign in to accept your invitation."
            : "There's already a Metric Mage account with this email. Sign in, or use Forgot password if you've forgotten it.",
        ),
        next,
      ),
    );
  if (!data.session) redirect("/check-email");
  redirect(next ?? "/welcome");
}
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/**
 * Emails a password reset link. The response is the same whether or not the address has an
 * account, so the form can't be used to discover who is registered.
 */
export async function requestPasswordReset(form: FormData) {
  const email = z.email().safeParse(form.get("email"));
  if (!email.success)
    redirect(messageUrl("/forgot-password", "error", "Enter a valid email address."));
  const supabase = await createClient();
  const {error} = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  if (error) console.error("Password reset request failed", error.message);
  redirect("/check-email?reason=reset");
}
/** Sets a new password for the user signed in through the reset link. */
export async function updatePassword(form: FormData) {
  const parsed = z
    .object({password: z.string().min(8).max(200), confirm: z.string()})
    .refine((v) => v.password === v.confirm)
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    redirect(
      messageUrl("/reset-password", "error", "Passwords must match and be at least 8 characters."),
    );
  const {supabase} = await requireUser();
  const {error} = await supabase.auth.updateUser({password: parsed.data.password});
  if (error)
    redirect(
      messageUrl("/reset-password", "error", "Your password couldn't be changed. Try again."),
    );
  redirect("/app?success=Your%20password%20has%20been%20changed.");
}
export async function signOut(form?: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // From an invitation, signing out leads back to it with a different account.
  const next = form?.get("next");
  redirect(next ? `/login?next=${encodeURIComponent(safeNext(next))}` : "/login");
}
export async function createOrganisation(form: FormData) {
  const name = z.string().trim().min(2).max(100).safeParse(form.get("name"));
  if (!name.success)
    redirect(messageUrl("/app/onboarding", "error", "Organisation name must be 2–100 characters."));
  const {supabase, user} = await requireUser();
  const {error} = await supabase.rpc("create_organisation_with_owner", {
    organisation_name: name.data,
    organisation_slug: uniqueSlug(name.data),
  });
  if (error)
    redirect(
      messageUrl(
        "/app/onboarding",
        "error",
        "Your workspace couldn't be created. Please try again.",
      ),
    );
  if (billingEnabled()) {
    if (!hasAccess(await billingAccount(user.id)))
      redirect(`/api/billing/checkout?next=${encodeURIComponent("/app")}`);
    after(() => syncOrganisationCount(user.id).catch((e) => console.error("Billing count", e)));
  }
  redirect("/app");
}
export async function addIntegration(form: FormData) {
  const schema = z.object({
    provider: z.enum(SUPPORTED_PROVIDERS),
    accountName: z.string().trim().max(120),
    status: z.enum(INTEGRATION_STATUSES),
  });
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    redirect(messageUrl("/app/integrations", "error", "Check the details and try again."));
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role, "integration.manage");
  const {error} = await ctx.supabase.from("integrations").insert({
    organisation_id: ctx.organisation.id,
    provider: parsed.data.provider,
    provider_account_name: parsed.data.accountName || null,
    status: parsed.data.status,
    settings: {},
  });
  if (error)
    redirect(messageUrl("/app/integrations", "error", "The integration could not be added."));
  revalidatePath("/app/integrations");
  redirect(messageUrl("/app/integrations", "success", "Test integration added."));
}
export async function deleteIntegration(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "integration.manage");
  await ctx.supabase
    .from("integrations")
    .delete()
    .eq("id", id.data)
    .eq("organisation_id", ctx.organisation.id);
  revalidatePath("/app/integrations");
}
export async function createTestEvent(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role, "event.create");
  try {
    const category = z.enum(EVENT_CATEGORIES).parse(form.get("category"));
    const severity = z.enum(EVENT_SEVERITIES).parse(form.get("severity"));
    const occurredAt = new Date(String(form.get("occurredAt"))).toISOString();
    const result = await createEvent(ctx.supabase, ctx.user.id, {
      organisationId: ctx.organisation.id,
      integrationId: String(form.get("integrationId") || "") || null,
      source: String(form.get("source") || ""),
      category,
      eventType: String(form.get("eventType") || ""),
      title: String(form.get("title") || ""),
      description: String(form.get("description") || "") || null,
      severity,
      occurredAt,
      externalId: String(form.get("externalId") || "") || null,
      metadata: parseJsonObject(String(form.get("metadata") || ""), "Metadata"),
      rawPayload: parseJsonObject(String(form.get("rawPayload") || ""), "Raw payload"),
    });
    if (!result.ok) throw new Error(result.message);
    redirect(
      messageUrl(
        "/app/timeline",
        "success",
        result.duplicate
          ? "That external event already exists; no duplicate was created."
          : "Event created.",
      ),
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(
      messageUrl(
        "/app/developer",
        "error",
        error instanceof Error ? error.message : "Check the event fields.",
      ),
    );
  }
}
export async function seedDemoEvents() {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role, "event.create");
  let created = 0;
  for (const event of createDemoEvents(ctx.organisation.id)) {
    const result = await createEvent(ctx.supabase, ctx.user.id, event);
    if (result.ok && !result.duplicate) created++;
  }
  revalidatePath("/app");
  redirect(
    messageUrl(
      "/app/timeline",
      "success",
      created
        ? `${created} demo events created.`
        : "Demo events already exist; no duplicates were created.",
    ),
  );
}
