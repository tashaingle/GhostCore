import Link from "next/link";
import {signIn, signUp} from "@/app/actions";
import {Notice} from "./notice";
import {AuthShell} from "./auth-shell";
import {SubmitButton} from "./submit-button";

export function AuthForm({
  mode,
  params,
}: {
  mode: "login" | "register";
  params: Record<string, string | string[] | undefined>;
}) {
  const register = mode === "register";

  return (
    <AuthShell
      title={register ? "Create your account" : "Welcome back"}
      subtitle={
        register
          ? "Free to start. You'll connect your first tool in a couple of minutes."
          : "Sign in to see what's happening in your business."
      }
      footer={
        <>
          {register ? "Already have an account? " : "New to Ghost? "}
          <Link
            className="font-medium text-violet-700 hover:underline"
            href={register ? "/login" : "/register"}
          >
            {register ? "Sign in" : "Create an account"}
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <Notice searchParams={params} />
        <form action={register ? signUp : signIn} className="space-y-4">
          {register ? (
            <label className="label">
              Your name
              <input className="field" name="fullName" autoComplete="name" required />
            </label>
          ) : null}
          <label className="label">
            Email
            <input className="field" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="label">
            <span className="flex items-center justify-between">
              Password
              {register ? null : (
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-violet-700 hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </span>
            <input
              className="field"
              name="password"
              type="password"
              minLength={8}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
            {register ? (
              <span className="text-xs font-normal text-zinc-500">At least 8 characters.</span>
            ) : null}
          </label>
          <SubmitButton
            className="button w-full"
            pendingLabel={register ? "Creating your account…" : "Signing in…"}
          >
            {register ? "Create account" : "Sign in"}
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
