"use server";
import {redirect} from "next/navigation";
import {readUnsubscribeToken} from "@/lib/email/unsubscribe";
import {createServiceClient} from "@/lib/supabase/service";

export async function stopWeeklySummary(form: FormData) {
  const who = readUnsubscribeToken(String(form.get("token") ?? ""));
  if (!who) redirect("/unsubscribe?error=1");
  await createServiceClient()
    .from("weekly_summary_opt_outs")
    .upsert(
      {organisation_id: who.organisationId, user_id: who.userId},
      {onConflict: "organisation_id,user_id", ignoreDuplicates: true},
    );
  redirect("/unsubscribe?done=1");
}
