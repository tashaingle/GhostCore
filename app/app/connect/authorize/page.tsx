import {redirect} from "next/navigation";
import {Check, Eye, ListPlus} from "lucide-react";
import {approveClaude, denyClaude} from "@/app/claude-actions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {sortProjects} from "@/lib/home/projects";
import {isAuthorizationId, isClientRedirect} from "@/lib/mcp/consent";
import {activeMemberships} from "@/lib/mcp/memberships";
import {getActiveOrganisation} from "@/lib/organisations/active";

export const metadata = {title: "Connect Claude"};

const hostOf = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
};

/**
 * Supabase Auth's OAuth server sends people here (with ?authorization_id=) when Claude asks to
 * connect. They're already signed in to Metric Mage; this page only asks them to agree.
 */
export default async function ConnectClaude({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.authorization_id)
    ? params.authorization_id[0]
    : params.authorization_id;
  const ctx = await getActiveOrganisation();

  const shell = (body: React.ReactNode) => (
    <section className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
          Connect Claude
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">
          Let Claude use Metric Mage?
        </h1>
      </div>
      <Notice searchParams={params} />
      {body}
    </section>
  );

  if (!isAuthorizationId(raw))
    return shell(
      <p className="card text-sm text-zinc-600">
        This link is missing its request. Start connecting again from Claude.
      </p>,
    );

  const {data, error} = await ctx.supabase.auth.oauth.getAuthorizationDetails(raw);
  if (error || !data)
    return shell(
      <p className="card text-sm text-zinc-600">
        This request has expired or has already been used. Start connecting again from Claude.
      </p>,
    );
  // Already agreed earlier for this client: Supabase hands back the code straight away.
  if ("redirect_url" in data) {
    if (isClientRedirect(data.redirect_url)) redirect(data.redirect_url);
    return shell(<p className="card text-sm text-zinc-600">Start connecting again from Claude.</p>);
  }

  // Every business they belong to, in any workspace: the same set the connector can read.
  const projects = sortProjects(
    (await activeMemberships(ctx.supabase, ctx.user.id)).map((item) => item.organisation),
  );
  const clientName = data.client.name || "Claude";
  return shell(
    <div className="card space-y-5">
      <p className="text-sm text-zinc-600">
        <strong className="text-zinc-950">{clientName}</strong>
        {data.client.uri ? <> ({hostOf(data.client.uri)})</> : null} wants to connect to your Metric
        Mage account, <strong className="text-zinc-950">{data.user.email}</strong>. It will send you
        back to <strong className="text-zinc-950">{hostOf(data.redirect_uri)}</strong>.
      </p>
      <ul className="space-y-3 text-sm text-zinc-700">
        <li className="flex gap-3">
          <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>
            Read your figures, highlights, insights and to-dos in the projects you belong to, with
            the same access you have in Metric Mage.
          </span>
        </li>
        <li className="flex gap-3">
          <ListPlus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>Add to-dos to your shared list, after checking with you in the chat.</span>
        </li>
        <li className="flex gap-3">
          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>You can disconnect it at any time from Settings.</span>
        </li>
      </ul>
      {projects.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Projects it can see
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {projects.map((project) => project.name).join(", ")}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <form action={approveClaude}>
          <input type="hidden" name="authorizationId" value={data.authorization_id} />
          <SubmitButton pendingLabel="Connecting…">Allow</SubmitButton>
        </form>
        <form action={denyClaude}>
          <input type="hidden" name="authorizationId" value={data.authorization_id} />
          <SubmitButton
            className="button bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
            pendingLabel="Cancelling…"
          >
            Don&apos;t allow
          </SubmitButton>
        </form>
      </div>
    </div>,
  );
}
