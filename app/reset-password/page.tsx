import Link from "next/link";
import {updatePassword} from "@/app/actions";
import {AuthShell} from "@/components/auth-shell";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {createClient} from "@/lib/supabase/server";

export const metadata = {title: "Choose a new password"};

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The reset link signs the user in via /auth/callback before landing here.
  const supabase = await createClient(),
    {
      data: {user},
    } = await supabase.auth.getUser();

  if (!user)
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Password reset links only work once and expire after a short time."
        footer={
          <Link className="font-medium text-violet-700 hover:underline" href="/login">
            Back to sign in
          </Link>
        }
      >
        <Link className="button w-full" href="/forgot-password">
          Send a new link
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell title="Choose a new password" subtitle={`For ${user.email}.`}>
      <div className="space-y-5">
        <Notice searchParams={await searchParams} />
        <form action={updatePassword} className="space-y-4">
          <label className="label">
            New password
            <input
              className="field"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <span className="text-xs font-normal text-zinc-500">At least 8 characters.</span>
          </label>
          <label className="label">
            Confirm new password
            <input
              className="field"
              name="confirm"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <SubmitButton className="button w-full" pendingLabel="Saving…">
            Save new password
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
