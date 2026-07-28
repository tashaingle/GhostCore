import Link from "next/link";
import { signIn, signUp } from "@/app/actions";
import { Notice } from "./notice";
export function AuthForm({ mode, params }:{mode:"login"|"register";params:Record<string,string|string[]|undefined>}) {
  const register=mode==="register";
  return <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6"><section className="card w-full space-y-5">
    <div><h1 className="text-2xl font-bold">Ghost Core</h1><p className="text-sm text-zinc-500">Business event infrastructure</p></div>
    <Notice searchParams={params}/><form action={register?signUp:signIn} className="space-y-4">
      {register&&<label className="label">Full name<input className="field" name="fullName" autoComplete="name" required/></label>}
      <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required/></label>
      <label className="label">Password<input className="field" name="password" type="password" minLength={8} autoComplete={register?"new-password":"current-password"} required/></label>
      <button className="button w-full">{register?"Create account":"Sign in"}</button>
    </form><p className="text-sm text-zinc-600">{register?"Already registered? ":"Need an account? "}<Link className="underline" href={register?"/login":"/register"}>{register?"Sign in":"Register"}</Link></p>
  </section></main>;
}
