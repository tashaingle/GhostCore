import Link from "next/link";
import {MailCheck} from "lucide-react";
import {AuthShell} from "@/components/auth-shell";

export const metadata = {title: "Check your email"};

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reset = (await searchParams).reason === "reset";
  return (
    <AuthShell
      title="Check your email"
      footer={
        <Link className="font-medium text-violet-700 hover:underline" href="/login">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
          <MailCheck aria-hidden className="h-6 w-6" />
        </span>
        <p className="text-zinc-600">
          {reset
            ? "If an account exists for that address, we've sent a link to choose a new password."
            : "We've sent you a link to confirm your email address. Click it to finish creating your account."}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-500">
          <li>The email can take a minute or two to arrive.</li>
          <li>Check your spam or junk folder if you can&apos;t see it.</li>
          <li>The link only works once.</li>
        </ul>
      </div>
    </AuthShell>
  );
}
