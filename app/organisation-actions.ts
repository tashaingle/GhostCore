"use server";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createHash, randomBytes} from "node:crypto";
import {z} from "zod";
import {requireUser} from "@/lib/auth/user";
import {getActiveOrganisation, ACTIVE_ORGANISATION_COOKIE} from "@/lib/organisations/active";
import {uniqueSlug} from "@/lib/organisations/slug";
import {optionalWebAddress} from "@/lib/forms/web-address";

/** The first thing wrong with a form, in words; our own messages win over zod's defaults. */
function firstProblem(error: z.ZodError) {
  const issue = error.issues[0];
  if (issue?.code === "custom") return issue.message;
  if (issue?.path[0] === "name") return "Organisation names must be 2 to 100 characters.";
  if (issue?.path[0] === "currency") return "Currency should be a 3-letter code, like GBP.";
  return "Check the details and try again.";
}
import {after} from "next/server";
import {hasAccess} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, syncOrganisationCount} from "@/lib/billing/stripe";
import {emailConfig, sendEmail} from "@/lib/email/resend";
import {invitationEmail} from "@/lib/email/templates";
import {
  ORGANISATION_ROLES,
  requirePermission,
  canManageRole,
  type OrganisationRole,
} from "@/lib/auth/permissions";
const message = (path: string, kind: "error" | "success", value: string) =>
  `${path}?${kind}=${encodeURIComponent(value)}`;
const setActive = async (id: string) => {
  (await cookies()).set(ACTIVE_ORGANISATION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 31536000,
  });
};
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

type ActiveContext = NonNullable<Awaited<ReturnType<typeof getActiveOrganisation>>>;

/**
 * Emails an invitation from Metric Mage through Resend. Without email configured, it falls back to
 * a sign-in link from Supabase, which reaches the person but doesn't mention the organisation.
 */
async function deliverInvitation(
  ctx: ActiveContext,
  invite: {email: string; role: string; token: string; expiresAt: string},
): Promise<{ok: true} | {ok: false; reason: string}> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    acceptUrl = `${site}/invite/${invite.token}`,
    config = emailConfig();
  if (!config) {
    const {error} = await ctx.supabase.auth.signInWithOtp({
      email: invite.email,
      options: {
        emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(`/invite/${invite.token}`)}`,
        shouldCreateUser: true,
      },
    });
    return error ? {ok: false, reason: error.message} : {ok: true};
  }
  const meta = (ctx.user.user_metadata ?? {}) as {full_name?: unknown},
    inviterName =
      (typeof meta.full_name === "string" && meta.full_name.trim()) ||
      ctx.user.email ||
      "Someone from your team";
  const email = invitationEmail({
    organisationName: ctx.organisation.name,
    inviterName,
    role: invite.role,
    acceptUrl,
    expiresAt: invite.expiresAt,
  });
  try {
    await sendEmail(config, {
      to: invite.email,
      ...email,
      // A new token per send, so a resend is a new email rather than a duplicate.
      idempotencyKey: `invitation:${hash(invite.token)}`,
    });
    return {ok: true};
  } catch (error) {
    return {ok: false, reason: error instanceof Error ? error.message : "Email couldn't be sent."};
  }
}
export async function createWorkspace(form: FormData) {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(100),
      logoUrl: optionalWebAddress(
        "The logo link doesn't look like a web address. Paste the link to an image, or leave it blank.",
      ).default(""),
      website: optionalWebAddress(
        "That website doesn't look right. Try something like yourbusiness.co.uk, or leave it blank.",
      ).default(""),
      industry: z.string().trim().max(100),
    })
    .safeParse(Object.fromEntries(form));
  const path = String(form.get("returnPath") || "/app/organisations/new");
  if (!parsed.success) redirect(message(path, "error", firstProblem(parsed.error)));
  const {supabase, user} = await requireUser();
  // A repeated submit (e.g. a double click) within a minute reuses the organisation just created.
  const {data: recent} = await supabase
    .from("organisations")
    .select("id")
    .eq("created_by", user.id)
    .eq("name", parsed.data.name)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString())
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (recent) {
    await supabase.from("profiles").update({active_organisation_id: recent.id}).eq("id", user.id);
    await setActive(recent.id);
    redirect("/welcome");
  }
  const {data: id, error} = await supabase.rpc("create_organisation_with_owner", {
    organisation_name: parsed.data.name,
    organisation_slug: uniqueSlug(parsed.data.name),
  });
  if (error || !id)
    redirect(message(path, "error", "Your workspace couldn't be created. Please try again."));
  await supabase
    .from("organisations")
    .update({
      logo_url: parsed.data.logoUrl || null,
      website: parsed.data.website || null,
      industry: parsed.data.industry || null,
    })
    .eq("id", id);
  await supabase.from("profiles").update({active_organisation_id: id}).eq("id", user.id);
  await setActive(id);
  if (billingEnabled()) {
    // No subscription yet: start the free trial, then carry on setting up.
    if (!hasAccess(await billingAccount(user.id)))
      redirect(`/api/billing/checkout?next=${encodeURIComponent("/welcome")}`);
    after(() => syncOrganisationCount(user.id).catch((e) => console.error("Billing count", e)));
  }
  redirect("/welcome");
}
export async function switchOrganisation(form: FormData) {
  const id = z.uuid().safeParse(form.get("organisationId"));
  if (!id.success) redirect("/app?error=Invalid%20organisation.");
  const {supabase, user} = await requireUser();
  const {data} = await supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", id.data)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!data) redirect("/app?error=You%20no%20longer%20have%20access%20to%20that%20organisation.");
  await supabase.from("profiles").update({active_organisation_id: id.data}).eq("id", user.id);
  await setActive(id.data);
  revalidatePath("/app", "layout");
  redirect("/app");
}
export async function updateOrganisation(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "organisation.edit");
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(100),
      logoUrl: optionalWebAddress(
        "The logo link doesn't look like a web address. Paste the link to an image, or leave it blank.",
      ).default(""),
      website: optionalWebAddress(
        "That website doesn't look right. Try something like yourbusiness.co.uk, or leave it blank.",
      ).default(""),
      industry: z.string().trim().max(100),
      timezone: z.string().trim().min(1).max(80),
      currency: z
        .string()
        .trim()
        .length(3)
        .transform((v) => v.toUpperCase()),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(message("/app/settings", "error", firstProblem(parsed.error)));
  const {error} = await ctx.supabase
    .from("organisations")
    .update({
      name: parsed.data.name,
      logo_url: parsed.data.logoUrl || null,
      website: parsed.data.website || null,
      industry: parsed.data.industry || null,
      timezone: parsed.data.timezone,
      default_currency: parsed.data.currency,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.organisation.id);
  if (error) redirect(message("/app/settings", "error", error.message));
  revalidatePath("/app", "layout");
  redirect(message("/app/settings", "success", "Organisation settings updated."));
}
export async function inviteMember(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "team.invite");
  const parsed = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      role: z.enum(["admin", "manager", "member", "viewer"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(message("/app/team", "error", "Enter a valid email and role."));
  const {data: alreadyMember} = await ctx.supabase.rpc("is_email_organisation_member", {
    target_organisation_id: ctx.organisation.id,
    target_email: parsed.data.email,
  });
  if (alreadyMember) redirect(message("/app/team", "error", "That person is already a member."));
  const {data: pending} = await ctx.supabase
    .from("organisation_invitations")
    .select("id")
    .eq("organisation_id", ctx.organisation.id)
    .eq("email", parsed.data.email)
    .eq("status", "pending")
    .maybeSingle();
  if (pending)
    redirect(message("/app/team", "error", "A pending invitation already exists for that email."));
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const {error} = await ctx.supabase.from("organisation_invitations").insert({
    organisation_id: ctx.organisation.id,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hash(token),
    invited_by: ctx.user.id,
    expires_at: expiresAt,
  });
  if (error)
    redirect(
      message(
        "/app/team",
        "error",
        error.code === "23505" ? "That person is already invited." : error.message,
      ),
    );
  const delivery = await deliverInvitation(ctx, {
    email: parsed.data.email,
    role: parsed.data.role,
    token,
    expiresAt,
  });
  redirect(
    message(
      "/app/team",
      delivery.ok ? "success" : "error",
      delivery.ok
        ? `Invitation sent to ${parsed.data.email}.`
        : `The invitation is saved, but the email couldn't be sent (${delivery.reason}). Click Resend to try again.`,
    ),
  );
}
export async function updateInvitation(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "team.invite");
  const id = z.uuid().safeParse(form.get("id")),
    action = String(form.get("action"));
  if (!id.success || !["cancel", "resend"].includes(action)) return;
  if (action === "cancel") {
    await ctx.supabase
      .from("organisation_invitations")
      .update({status: "cancelled", updated_at: new Date().toISOString()})
      .eq("id", id.data)
      .eq("organisation_id", ctx.organisation.id);
    revalidatePath("/app/team");
    redirect(message("/app/team", "success", "Invitation cancelled."));
  } else {
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const {data: invite} = await ctx.supabase
      .from("organisation_invitations")
      .update({
        token_hash: hash(token),
        expires_at: expiresAt,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id.data)
      .eq("organisation_id", ctx.organisation.id)
      .select("email,role")
      .single();
    if (invite) {
      const delivery = await deliverInvitation(ctx, {
        email: invite.email,
        role: invite.role,
        token,
        expiresAt,
      });
      revalidatePath("/app/team");
      redirect(
        message(
          "/app/team",
          delivery.ok ? "success" : "error",
          delivery.ok
            ? `Invitation sent again to ${invite.email}.`
            : `The email couldn't be sent (${delivery.reason}). Try again shortly.`,
        ),
      );
    }
  }
  revalidatePath("/app/team");
}
export async function updateMember(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return;
  requirePermission(ctx.membership.role, "team.manage");
  const id = z.uuid().safeParse(form.get("id")),
    role = z.enum(ORGANISATION_ROLES).safeParse(form.get("role")),
    action = String(form.get("action"));
  if (!id.success) return;
  const {data: target} = await ctx.supabase
    .from("organisation_members")
    .select("user_id,role")
    .eq("id", id.data)
    .eq("organisation_id", ctx.organisation.id)
    .maybeSingle();
  if (
    !target ||
    !canManageRole(ctx.membership.role as OrganisationRole, target.role as OrganisationRole)
  )
    redirect(message("/app/team", "error", "You cannot manage that member."));
  if (action === "remove") {
    if (target.user_id === ctx.user.id) {
      const {count} = await ctx.supabase
        .from("organisation_members")
        .select("*", {count: "exact", head: true})
        .eq("organisation_id", ctx.organisation.id)
        .eq("role", "owner")
        .eq("status", "active");
      if ((count ?? 0) <= 1)
        redirect(message("/app/team", "error", "The only owner cannot remove themselves."));
    }
    const {error} = await ctx.supabase
      .from("organisation_members")
      .delete()
      .eq("id", id.data)
      .eq("organisation_id", ctx.organisation.id);
    revalidatePath("/app/team");
    redirect(
      message(
        "/app/team",
        error ? "error" : "success",
        error
          ? "They couldn't be removed. Please try again."
          : `They've been removed from ${ctx.organisation.name}.`,
      ),
    );
  } else if (role.success) {
    if (role.data === "owner" && ctx.membership.role !== "owner")
      redirect(message("/app/team", "error", "Only owners can promote another owner."));
    const {error} = await ctx.supabase
      .from("organisation_members")
      .update({role: role.data})
      .eq("id", id.data)
      .eq("organisation_id", ctx.organisation.id);
    revalidatePath("/app/team");
    redirect(
      message(
        "/app/team",
        error ? "error" : "success",
        error ? "The role couldn't be changed. Please try again." : `Role changed to ${role.data}.`,
      ),
    );
  }
  revalidatePath("/app/team");
}
export async function acceptInvitation(form: FormData) {
  const token = z.string().min(20).safeParse(form.get("token"));
  if (!token.success) redirect("/login?error=Invitation%20is%20invalid.");
  const {supabase} = await requireUser();
  const {data: id, error} = await supabase.rpc("accept_organisation_invitation", {
    invitation_token_hash: hash(token.data),
  });
  if (error || !id)
    redirect(
      `/invite/${encodeURIComponent(token.data)}?error=${encodeURIComponent(error?.message ?? "Invitation is invalid or expired.")}`,
    );
  await setActive(id);
  redirect("/app?success=Invitation%20accepted.");
}
