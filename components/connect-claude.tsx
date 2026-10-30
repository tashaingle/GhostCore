import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {revokeClaude} from "@/app/claude-actions";
import {SubmitButton} from "@/components/submit-button";
import {mcpUrl} from "@/lib/mcp/urls";

const grantedOn = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"});

/** Settings section: how to add Metric Mage to Claude, and the connections to disconnect. */
export async function ConnectClaude({supabase}: {supabase: SupabaseClient<Database>}) {
  const {data: grants, error} = await supabase.auth.oauth.listGrants();
  const url = mcpUrl();
  return (
    <section id="claude" aria-labelledby="claude-heading" className="card space-y-4">
      <div>
        <h3 id="claude-heading" className="text-lg font-semibold text-zinc-950">
          Connect Claude
        </h3>
        <p className="text-sm text-zinc-600">
          Ask Claude about your figures, insights and to-dos. It sees only the projects you belong
          to, with the same access you have here.
        </p>
      </div>
      <label className="label">
        Connector URL
        <input className="field font-mono text-sm" readOnly value={url} />
      </label>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
        <li>
          In Claude, open <strong>Settings → Connectors</strong> and choose{" "}
          <strong>Add custom connector</strong>.
        </li>
        <li>Name it Metric Mage and paste the connector URL above.</li>
        <li>Choose Connect, sign in to Metric Mage if asked, and select Allow.</li>
        <li>
          In Claude Code, run{" "}
          <code className="text-xs">claude mcp add --transport http metric-mage {url}</code> then{" "}
          <code className="text-xs">/mcp</code> to sign in.
        </li>
      </ol>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Connected apps
        </p>
        {error ? (
          <p className="text-sm text-zinc-500">Connections can&apos;t be listed right now.</p>
        ) : grants?.length ? (
          <ul className="divide-y divide-zinc-100">
            {grants.map((grant) => (
              <li key={grant.client.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {grant.client.name || "Unnamed app"}
                  </p>
                  <p className="text-xs text-zinc-500">Connected {grantedOn(grant.granted_at)}</p>
                </div>
                <form action={revokeClaude}>
                  <input type="hidden" name="clientId" value={grant.client.id} />
                  <SubmitButton
                    className="button bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                    pendingLabel="Disconnecting…"
                  >
                    Disconnect
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nothing is connected yet.</p>
        )}
      </div>
    </section>
  );
}
