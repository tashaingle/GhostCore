"use server";
import * as Sentry from "@sentry/nextjs";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";

/** Temporary: sends one test error from the server to Sentry. Owners only. */
export async function sendServerTestError() {
  const ctx = await getActiveOrganisation();
  if (ctx.membership.role !== "owner") redirect("/app");
  Sentry.captureException(new Error("Sentry test from the server (safe to ignore)"));
  await Sentry.flush(5000);
  redirect("/app/sentry-test?success=Server%20test%20error%20sent.");
}
