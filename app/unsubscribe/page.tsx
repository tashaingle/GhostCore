import Link from "next/link";
import {AuthShell} from "@/components/auth-shell";
import {SubmitButton} from "@/components/submit-button";
import {readUnsubscribeToken} from "@/lib/email/unsubscribe";
import {stopWeeklySummary} from "./actions";

/**
 * Asks before unsubscribing, because some email systems open every link in an email
 * automatically and would otherwise switch the email off on people's behalf.
 */
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams,
    token = typeof params.token === "string" ? params.token : "",
    valid = Boolean(readUnsubscribeToken(token));
  if (params.done)
    return (
      <AuthShell title="Done" subtitle="You won't get the Monday summary email any more.">
        <p className="text-sm text-zinc-600">
          Changed your mind? Turn it back on in Metric Mage under{" "}
          <Link className="underline" href="/app/action-centre/preferences">
            Action Centre → Email settings
          </Link>
          .
        </p>
      </AuthShell>
    );
  if (!valid)
    return (
      <AuthShell
        title="That link didn't work"
        subtitle="It may have been cut short by your email app."
      >
        <p className="text-sm text-zinc-600">
          You can turn the Monday email off in Metric Mage under{" "}
          <Link className="underline" href="/app/action-centre/preferences">
            Action Centre → Email settings
          </Link>
          .
        </p>
      </AuthShell>
    );
  return (
    <AuthShell
      title="Stop the Monday email?"
      subtitle="You'll stop getting the weekly summary for this organisation. Alerts you've turned on aren't affected."
    >
      <form action={stopWeeklySummary} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="button w-full justify-center" pendingLabel="Saving…">
          Stop Monday emails
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
