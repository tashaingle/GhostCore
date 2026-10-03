import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {acceptInvitation} from "@/app/organisation-actions";
import {signOut} from "@/app/actions";
import {AuthShell} from "@/components/auth-shell";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export default async function Invitation({
  params,
  searchParams,
}: {
  params: Promise<{token: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {token} = await params,
    supabase = await createClient(),
    {
      data: {user},
    } = await supabase.auth.getUser();
  // Sign-in and sign-up both bring the person straight back here to accept.
  const back = `?next=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <AuthShell
      title="You've been invited"
      subtitle={
        user
          ? "Accept to join the team. You'll find the organisation in your organisation switcher."
          : "Create an account or sign in with the email address the invitation was sent to."
      }
    >
      <div className="space-y-5">
        <Notice searchParams={await searchParams} />
        {user ? (
          <>
            <p className="text-sm text-zinc-600">
              You&apos;re signed in as <strong className="text-zinc-950">{user.email}</strong>.
            </p>
            <form action={acceptInvitation}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="button w-full justify-center" pendingLabel="Joining…">
                Accept invitation
              </SubmitButton>
            </form>
            <form action={signOut} className="text-center">
              <input type="hidden" name="next" value={`/invite/${token}`} />
              <button className="text-sm text-zinc-500 underline-offset-4 hover:underline">
                Not you? Sign in with a different email
              </button>
            </form>
          </>
        ) : (
          <div className="grid gap-3">
            <Link className="button justify-center" href={`/register${back}`}>
              Create an account
            </Link>
            <Link className="button button-secondary justify-center" href={`/login${back}`}>
              I already have an account
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
