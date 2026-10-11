import {notFound} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {Notice} from "@/components/notice";
import {SentryTestButtons} from "./test-buttons";

/** Temporary page to check errors reach Sentry. Owners only; remove once confirmed. */
export default async function SentryTest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (ctx.membership.role !== "owner") notFound();
  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sentry test</h1>
      <p className="text-sm text-zinc-500">
        Click both buttons, then check Issues in Sentry. Two test errors should appear within a
        minute. Nothing else happens and no customer sees this page.
      </p>
      <Notice searchParams={await searchParams} />
      <SentryTestButtons />
    </section>
  );
}
