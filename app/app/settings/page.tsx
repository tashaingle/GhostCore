import {getActiveOrganisation} from "@/lib/organisations/active";
import {updateOrganisation} from "@/app/organisation-actions";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {deleteAccount, deleteOrganisation} from "@/app/account-actions";
import {ACCOUNT_DELETE_PHRASE, planAccountDeletion} from "@/lib/account/deletion";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const editable = hasPermission(ctx.membership.role as OrganisationRole, "organisation.edit");
  const isOwner = ctx.membership.role === "owner";
  // Preview what deleting the account would do, so it is clear before confirming.
  const {data: members} = await ctx.supabase
    .from("organisation_members")
    .select("organisation_id,role")
    .in(
      "organisation_id",
      ctx.organisations.map((o) => o.id),
    )
    .eq("status", "active");
  const accountPlan = planAccountDeletion(
    ctx.organisations.map((o) => {
      const here = (members ?? []).filter((m) => m.organisation_id === o.id);
      return {
        organisationId: o.id,
        name: o.name,
        role: o.role,
        memberCount: here.length,
        ownerCount: here.filter((m) => m.role === "owner").length,
      };
    }),
  );
  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Organisation Settings</h2>
        <p className="text-zinc-600">
          Settings for {ctx.organisation.name}. Your role is {ctx.membership.role}.
        </p>
      </div>
      <Notice searchParams={await searchParams} />
      <form action={updateOrganisation} className="card grid gap-4">
        <label className="label">
          Name
          <input
            className="field"
            name="name"
            defaultValue={ctx.organisation.name}
            disabled={!editable}
          />
        </label>
        <label className="label">
          Logo URL
          <input
            className="field"
            type="url"
            name="logoUrl"
            defaultValue={ctx.organisation.logo_url ?? ""}
            disabled={!editable}
          />
        </label>
        <label className="label">
          Website
          <input
            className="field"
            type="url"
            name="website"
            defaultValue={ctx.organisation.website ?? ""}
            disabled={!editable}
          />
        </label>
        <label className="label">
          Industry
          <input
            className="field"
            name="industry"
            defaultValue={ctx.organisation.industry ?? ""}
            disabled={!editable}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Timezone
            <input
              className="field"
              name="timezone"
              defaultValue={ctx.organisation.timezone}
              disabled={!editable}
            />
          </label>
          <label className="label">
            Default currency
            <input
              className="field"
              name="currency"
              defaultValue={ctx.organisation.default_currency}
              maxLength={3}
              disabled={!editable}
            />
          </label>
        </div>
        {editable ? (
          <button className="button justify-self-start">Save settings</button>
        ) : (
          <p className="text-sm text-zinc-500">
            Only owners and admins can edit organisation settings.
          </p>
        )}
      </form>

      <section aria-labelledby="danger-heading" className="space-y-4 pt-4">
        <div>
          <h3 id="danger-heading" className="text-lg font-semibold text-rose-700">
            Danger zone
          </h3>
          <p className="text-sm text-zinc-500">
            These actions are permanent and can&apos;t be undone.
          </p>
        </div>

        {isOwner ? (
          <form action={deleteOrganisation} className="card space-y-3 border-rose-200">
            <h4 className="font-semibold text-zinc-900">Delete {ctx.organisation.name}</h4>
            <p className="text-sm text-zinc-600">
              Deletes this organisation and everything in it: connected tools, imported activity,
              alerts, insights, tasks, automations and team access. Ghost also removes its access to
              GitHub. Your other organisations aren&apos;t affected.
            </p>
            <label className="label">
              <span>
                {"Type "}
                <strong>{ctx.organisation.name}</strong>
                {" to confirm"}
              </span>
              <input className="field" name="confirm" autoComplete="off" required />
            </label>
            <SubmitButton className="button bg-rose-600 hover:bg-rose-700" pendingLabel="Deleting…">
              Delete this organisation
            </SubmitButton>
          </form>
        ) : null}

        <form action={deleteAccount} className="card space-y-3 border-rose-200">
          <h4 className="font-semibold text-zinc-900">Delete your account</h4>
          <p className="text-sm text-zinc-600">
            Deletes your Ghost login and personal details. You&apos;ll be signed out.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">
            {accountPlan.deleteOrganisations.length ? (
              <li>
                Also deleted, because you&apos;re their only member:{" "}
                <strong>{accountPlan.deleteOrganisations.map((o) => o.name).join(", ")}</strong>
              </li>
            ) : null}
            {accountPlan.leaveOrganisations.length ? (
              <li>
                You&apos;ll leave, and their data stays with the team:{" "}
                <strong>{accountPlan.leaveOrganisations.map((o) => o.name).join(", ")}</strong>
              </li>
            ) : null}
          </ul>
          {accountPlan.blockers.length ? (
            <p className="error">
              You&apos;re the only owner of{" "}
              <strong>{accountPlan.blockers.map((o) => o.name).join(", ")}</strong>, which other
              people still use. Make someone else an owner in Team, or delete it, first.
            </p>
          ) : (
            <>
              <label className="label">
                <span>
                  {"Type "}
                  <strong>{ACCOUNT_DELETE_PHRASE}</strong>
                  {" to confirm"}
                </span>
                <input className="field" name="confirm" autoComplete="off" required />
              </label>
              <SubmitButton
                className="button bg-rose-600 hover:bg-rose-700"
                pendingLabel="Deleting…"
              >
                Delete my account
              </SubmitButton>
            </>
          )}
        </form>
      </section>
    </section>
  );
}
