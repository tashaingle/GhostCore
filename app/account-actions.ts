"use server";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {requireUser} from "@/lib/auth/user";
import {ACTIVE_ORGANISATION_COOKIE, getActiveOrganisation} from "@/lib/organisations/active";
import {createServiceClient} from "@/lib/supabase/service";
import {githubAppEnv, uninstall} from "@/lib/integrations/github/app";
import {
  confirmsAccountDeletion,
  confirmsOrganisationName,
  planAccountDeletion,
} from "@/lib/account/deletion";

const settings = (kind: "error" | "success", message: string) =>
  `/app/settings?${kind}=${encodeURIComponent(message)}`;

/** Best effort: remove Metric Mage from GitHub for any GitHub App installations in these organisations. */
async function uninstallGitHub(service: SupabaseClient<Database>, organisationIds: string[]) {
  const env = githubAppEnv();
  if (!env || !organisationIds.length) return;
  const {data} = await service
    .from("integrations")
    .select("settings")
    .eq("provider", "github")
    .in("organisation_id", organisationIds);
  for (const row of data ?? []) {
    const id = (row.settings as Record<string, unknown> | null)?.installationId;
    if (typeof id === "string")
      await uninstall(env, id).catch((error) => console.error("GitHub uninstall failed", error));
  }
}

/** Permanently deletes the active organisation and everything in it. Owners only. */
export async function deleteOrganisation(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (ctx.membership.role !== "owner")
    redirect(settings("error", "Only an owner can delete this organisation."));
  if (!confirmsOrganisationName(form.get("confirm"), ctx.organisation.name))
    redirect(settings("error", "Type the organisation's name exactly to confirm."));

  const service = createServiceClient(),
    id = ctx.organisation.id;
  await uninstallGitHub(service, [id]);
  const {error} = await service.from("organisations").delete().eq("id", id);
  if (error) {
    console.error("Organisation deletion failed", error);
    redirect(settings("error", "The organisation could not be deleted. Please try again."));
  }

  // Move to another organisation the user belongs to, or to onboarding if none remain.
  const next = ctx.organisations.find((o) => o.id !== id),
    store = await cookies();
  if (next) {
    store.set(ACTIVE_ORGANISATION_COOKIE, next.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 31536000,
    });
    await ctx.supabase
      .from("profiles")
      .update({active_organisation_id: next.id})
      .eq("id", ctx.user.id);
    redirect(`/app?success=${encodeURIComponent(`${ctx.organisation.name} was deleted.`)}`);
  }
  store.delete(ACTIVE_ORGANISATION_COOKIE);
  redirect("/app/onboarding");
}

/**
 * Permanently deletes the signed-in user's account. Organisations only they belong to are deleted
 * with it; if they are the only owner of an organisation with other members, deletion is refused
 * so that team is not left without an owner.
 */
export async function deleteAccount(form: FormData) {
  const {supabase, user} = await requireUser();
  if (!confirmsAccountDeletion(form.get("confirm")))
    redirect(settings("error", "Type DELETE to confirm deleting your account."));

  const service = createServiceClient(),
    {data: memberships} = await service
      .from("organisation_members")
      .select("organisation_id,role,organisations(name)")
      .eq("user_id", user.id)
      .eq("status", "active");
  const ids = (memberships ?? []).map((m) => m.organisation_id),
    {data: everyone} = ids.length
      ? await service
          .from("organisation_members")
          .select("organisation_id,role")
          .in("organisation_id", ids)
          .eq("status", "active")
      : {data: []};
  const plan = planAccountDeletion(
    (memberships ?? []).map((m) => {
      const others = (everyone ?? []).filter((e) => e.organisation_id === m.organisation_id),
        org = m.organisations as {name?: string} | {name?: string}[] | null;
      return {
        organisationId: m.organisation_id,
        name: (Array.isArray(org) ? org[0]?.name : org?.name) ?? "an organisation",
        role: m.role,
        memberCount: others.length,
        ownerCount: others.filter((e) => e.role === "owner").length,
      };
    }),
  );
  if (plan.blockers.length)
    redirect(
      settings(
        "error",
        `You're the only owner of ${plan.blockers.map((b) => b.name).join(", ")}. Make someone else an owner in Team, or delete it, before deleting your account.`,
      ),
    );

  const soloIds = plan.deleteOrganisations.map((o) => o.id);
  await uninstallGitHub(service, soloIds);
  if (soloIds.length) {
    const {error} = await service.from("organisations").delete().in("id", soloIds);
    if (error) {
      console.error("Account deletion: organisations", error);
      redirect(settings("error", "Your account could not be deleted. Please try again."));
    }
  }
  const {error} = await service.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Account deletion: user", error);
    redirect(settings("error", "Your account could not be deleted. Please try again."));
  }
  await supabase.auth.signOut().catch(() => {});
  (await cookies()).delete(ACTIVE_ORGANISATION_COOKIE);
  redirect("/login?success=Your%20account%20and%20data%20have%20been%20deleted.");
}
