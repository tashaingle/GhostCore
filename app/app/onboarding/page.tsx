import {createWorkspace} from "@/app/organisation-actions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {redirect} from "next/navigation";
/** First-time setup now lives at /welcome (full screen, no sidebar). */
export default function Onboarding() {
  redirect("/welcome");
}
function WorkspaceForm({
  params,
  returnPath,
  title,
  note,
}: {
  params: Record<string, string | string[] | undefined>;
  returnPath: string;
  title: string;
  /** e.g. what this organisation adds to the monthly bill. */
  note?: string;
}) {
  return (
    <section className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Welcome</p>
        <h2 className="page-title mt-1">{title}</h2>
        <p className="page-subtitle">
          Each organisation is a separate, secure workspace for your team and tools.
        </p>
        {note ? <p className="mt-2 text-sm font-medium text-zinc-700">{note}</p> : null}
      </div>
      <Notice searchParams={params} />
      <form action={createWorkspace} className="card space-y-4">
        <input type="hidden" name="returnPath" value={returnPath} />
        <label className="label">
          Organisation name
          <input
            className="field"
            name="name"
            required
            minLength={2}
            maxLength={100}
            placeholder="Acme Commerce"
          />
          <span className="text-xs font-normal text-zinc-500">
            Usually your company or team name.
          </span>
        </label>
        <label className="label">
          Logo URL (optional)
          <input
            className="field"
            name="logoUrl"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="Link to your logo (optional)"
          />
        </label>
        <label className="label">
          Website (optional)
          <input
            className="field"
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="yourbusiness.co.uk"
          />
        </label>
        <label className="label">
          Industry (optional)
          <input
            className="field"
            name="industry"
            maxLength={100}
            placeholder="E‑commerce, SaaS…"
          />
        </label>
        <SubmitButton className="button w-full" pendingLabel="Creating…">
          Create organisation
        </SubmitButton>
      </form>
    </section>
  );
}
export {WorkspaceForm};
