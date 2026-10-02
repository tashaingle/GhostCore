import Link from "next/link";
import {requestPasswordReset} from "@/app/actions";
import {AuthShell} from "@/components/auth-shell";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export const metadata = {title: "Reset your password"};

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you sign in with and we'll send you a link to choose a new password."
      footer={
        <Link className="font-medium text-violet-700 hover:underline" href="/login">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        <Notice searchParams={await searchParams} />
        <form action={requestPasswordReset} className="space-y-4">
          <label className="label">
            Email
            <input className="field" name="email" type="email" autoComplete="email" required />
          </label>
          <SubmitButton className="button w-full" pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
