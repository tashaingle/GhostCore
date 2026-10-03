import Link from "next/link";
import {ArrowRight, Check, LogOut} from "lucide-react";
import {requireUser} from "@/lib/auth/user";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {getProvider, providers, type ProviderDefinition} from "@/lib/integrations/registry";
import {githubAppEnv} from "@/lib/integrations/github/app";
import {createWorkspace} from "@/app/organisation-actions";
import {signOut} from "@/app/actions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {ProviderMark} from "@/components/home-ui";
import {BrandMark} from "@/components/brand-mark";

export const metadata = {title: "Welcome"};

/** The tools most businesses start with, in the order we suggest them. */
const POPULAR = [
  "shopify",
  "stripe",
  "google_analytics",
  "meta_ads",
  "gmail",
  "google_search_console",
  "slack",
  "github",
  "vercel",
];

function connectHref(provider: ProviderDefinition) {
  if (provider.id === "github")
    return githubAppEnv() ? "/api/integrations/github/connect" : "/app/integrations";
  // Shopify needs the store's address before it can connect.
  if (provider.id === "shopify") return provider.configurationPath ?? "/app/integrations";
  return provider.connectPath ?? "/app/integrations";
}

function Steps({current}: {current: 1 | 2}) {
  const steps = ["Name your business", "Connect a tool", "See what's happening"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((label, i) => {
        const n = i + 1,
          done = n < current,
          active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-200 text-zinc-500"
              }`}
            >
              {done ? <Check aria-hidden className="h-4 w-4" /> : n}
            </span>
            <span
              className={`hidden sm:inline ${active ? "font-medium text-zinc-900" : "text-zinc-500"}`}
            >
              {label}
            </span>
            {n < steps.length ? (
              <span aria-hidden className="mx-1 h-px w-6 bg-zinc-300 sm:w-10" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default async function Welcome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const {user} = await requireUser();
  const ctx = await getActiveOrganisation(true);
  const firstName =
    (user.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ?? null;

  let connected = new Set<string>();
  if (ctx) {
    const {data} = await ctx.supabase
      .from("integrations")
      .select("provider,status")
      .eq("organisation_id", ctx.organisation.id)
      .neq("status", "disconnected");
    connected = new Set((data ?? []).map((i) => i.provider));
  }
  const tools = POPULAR.map((id) => getProvider(id)).filter((p): p is ProviderDefinition =>
    Boolean(p),
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-violet-50/40">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-semibold tracking-tight">Metric Mage</span>
        </span>
        <form action={signOut}>
          <button className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
            <LogOut aria-hidden className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-4xl px-6 pb-16 pt-4">
        <Steps current={ctx ? 2 : 1} />

        {!ctx ? (
          <section className="mt-10 max-w-lg">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {firstName ? `Welcome, ${firstName}.` : "Welcome."} What&apos;s your business called?
            </h1>
            <p className="mt-3 text-zinc-500">
              This becomes your workspace. You can invite your team and rename it later.
            </p>
            <div className="mt-8 space-y-4">
              <Notice searchParams={params} />
              <form
                action={createWorkspace}
                className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm"
              >
                <input type="hidden" name="returnPath" value="/welcome" />
                <input type="hidden" name="logoUrl" value="" />
                <input type="hidden" name="industry" value="" />
                <label className="label">
                  Business name
                  <input
                    className="field"
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="e.g. Rabbit Care"
                    autoFocus
                  />
                </label>
                <label className="label">
                  Website <span className="font-normal text-zinc-400">(optional)</span>
                  <input className="field" name="website" type="url" placeholder="https://…" />
                </label>
                <SubmitButton className="button w-full" pendingLabel="Creating your workspace…">
                  Continue
                </SubmitButton>
              </form>
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Connect your first tool
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-500">
              {`Pick something ${ctx.organisation.name} already uses. You'll sign in to it, allow access, and Metric Mage starts importing straight away. You can add more any time.`}
            </p>
            <div className="mt-4">
              <Notice searchParams={params} />
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {tools.map((tool) => {
                const isConnected = connected.has(tool.id);
                return (
                  <li key={tool.id}>
                    <Link
                      href={isConnected ? "/app/integrations" : connectHref(tool)}
                      className={`group flex h-full items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                        isConnected
                          ? "border-emerald-200"
                          : "border-zinc-200/80 hover:border-zinc-300"
                      }`}
                    >
                      <ProviderMark provider={tool.id} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-950">{tool.displayName}</p>
                        <p className="line-clamp-2 text-sm text-zinc-500">{tool.description}</p>
                      </div>
                      {isConnected ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          <Check aria-hidden className="h-3.5 w-3.5" />
                          Connected
                        </span>
                      ) : (
                        <ArrowRight
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-700"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6">
              <Link
                href="/app/integrations"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
              >
                See all {providers.length} tools
              </Link>
              <Link href="/app" className="button">
                {connected.size ? "Continue to Metric Mage" : "Skip for now"}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
