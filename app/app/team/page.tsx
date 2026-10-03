import {getActiveOrganisation} from "@/lib/organisations/active";
import {PageHeader} from "@/components/page-header";
import {ROLE_DESCRIPTIONS} from "@/lib/ui/labels";
import {hasPermission, type OrganisationRole, ORGANISATION_ROLES} from "@/lib/auth/permissions";
import {inviteMember, updateInvitation, updateMember} from "@/app/organisation-actions";
import {Notice} from "@/components/notice";
import {ConfirmSubmit} from "@/components/confirm-submit";
import {organisationPeople} from "@/lib/organisations/people";

export default async function Team({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const canInvite = hasPermission(ctx.membership.role as OrganisationRole, "team.invite"),
    canManage = hasPermission(ctx.membership.role as OrganisationRole, "team.manage");
  const [{data: members}, {data: invitations}] = await Promise.all([
    ctx.supabase
      .from("organisation_members")
      .select("id,user_id,role,status,created_at")
      .eq("organisation_id", ctx.organisation.id)
      .order("created_at"),
    ctx.supabase
      .from("organisation_invitations")
      .select("id,email,role,status,expires_at,created_at")
      .eq("organisation_id", ctx.organisation.id)
      .order("created_at", {ascending: false}),
  ]);
  const ids = (members ?? []).map((member) => member.user_id),
    profiles = ids.length
      ? ((await ctx.supabase.from("profiles").select("id,full_name,avatar_url").in("id", ids))
          .data ?? [])
      : [],
    profileMap = new Map(profiles.map((profile) => [profile.id, profile])),
    people = await organisationPeople(ctx.supabase, ctx.organisation.id),
    emails = new Map(people.list.flatMap((x) => (x.email ? [[x.userId, x.email] as const] : [])));
  return (
    <section className="space-y-6">
      <PageHeader
        title="Team"
        description={`People who can use ${ctx.organisation.name}, and what they're allowed to do.`}
      />
      <Notice searchParams={await searchParams} />
      {canInvite && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-zinc-950">Invite someone</h2>
            <p className="text-sm text-zinc-500">They&apos;ll get an email with a link to join.</p>
          </div>
          <form action={inviteMember} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              className="field"
              name="email"
              type="email"
              placeholder="person@example.com"
              required
            />
            <select className="field" name="role" defaultValue="member">
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="button">Send invitation</button>
          </form>
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-600 hover:text-zinc-950">
              What each role can do
            </summary>
            <dl className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr]">
              {Object.entries(ROLE_DESCRIPTIONS).map(([role, text]) => (
                <div key={role} className="contents">
                  <dt className="font-medium capitalize text-zinc-900">{role}</dt>
                  <dd className="text-zinc-600">{text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
      <div className="card overflow-auto">
        <h3 className="mb-4 font-semibold">Members</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="py-2">Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => {
              const profile = profileMap.get(member.user_id),
                email = emails.get(member.user_id),
                you = member.user_id === ctx.user.id,
                name = profile?.full_name || email || "Team member";
              return (
                <tr className="border-b last:border-0" key={member.id}>
                  <td className="py-3">
                    <span className="font-medium text-zinc-950">
                      {name}
                      {you ? " (you)" : ""}
                    </span>
                    {email && profile?.full_name ? (
                      <span className="block text-xs text-zinc-500">{email}</span>
                    ) : null}
                  </td>
                  <td className="capitalize" title={ROLE_DESCRIPTIONS[member.role]}>
                    {member.role}
                  </td>
                  <td className="capitalize">{member.status}</td>
                  <td>{new Date(member.created_at).toLocaleDateString()}</td>
                  <td>
                    {canManage && member.id !== ctx.membership.id && (
                      <form
                        action={updateMember}
                        className="flex flex-wrap items-center justify-end gap-2"
                      >
                        <input type="hidden" name="id" value={member.id} />
                        <select className="field py-1" name="role" defaultValue={member.role}>
                          {ORGANISATION_ROLES.map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                        <button className="button button-secondary" name="action" value="role">
                          Save
                        </button>
                        <ConfirmSubmit
                          label="Remove"
                          question={`Remove ${name} from ${ctx.organisation.name}? They'll lose access straight away.`}
                          confirmLabel="Yes, remove"
                          name="action"
                          value="remove"
                        />
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canInvite && (
        <div className="card">
          <h3 className="mb-4 font-semibold">Invitations</h3>
          <div className="space-y-3">
            {!(invitations ?? []).length ? (
              <p className="text-sm text-zinc-500">No invitations.</p>
            ) : (
              (invitations ?? []).map((invite) => (
                <div
                  className="flex flex-wrap items-center gap-3 border-b pb-3 text-sm last:border-0"
                  key={invite.id}
                >
                  <span className="font-medium">{invite.email}</span>
                  <span className="capitalize">{invite.role}</span>
                  <span className="capitalize text-zinc-500">
                    {new Date(invite.expires_at) <= new Date() && invite.status === "pending"
                      ? "expired"
                      : invite.status}
                  </span>
                  {invite.status === "pending" && (
                    <form
                      action={updateInvitation}
                      className="ml-auto flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="id" value={invite.id} />
                      <button className="button button-secondary" name="action" value="resend">
                        Resend
                      </button>
                      <ConfirmSubmit
                        label="Cancel"
                        question={`Cancel the invitation to ${invite.email}? The link in their email will stop working.`}
                        confirmLabel="Yes, cancel it"
                        name="action"
                        value="cancel"
                      />
                    </form>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
