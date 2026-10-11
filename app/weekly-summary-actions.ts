"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";

/** Turns the Monday summary email on or off for the signed-in person in this organisation. */
export async function setWeeklySummary(form: FormData) {
  const ctx = await getActiveOrganisation();
  const on = form.get("on") === "true",
    table = ctx.supabase.from("weekly_summary_opt_outs");
  const {error} = on
    ? await table.delete().eq("organisation_id", ctx.organisation.id).eq("user_id", ctx.user.id)
    : await table.upsert(
        {organisation_id: ctx.organisation.id, user_id: ctx.user.id},
        {onConflict: "organisation_id,user_id", ignoreDuplicates: true},
      );
  const [kind, text] = error
    ? ["error", "That couldn't be saved. Please try again."]
    : [
        "success",
        on ? "You'll get the Monday summary email." : "You won't get the Monday summary email.",
      ];
  redirect(`/app/action-centre/preferences?${kind}=${encodeURIComponent(text)}`);
}
