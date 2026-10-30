import {WorkspaceForm} from "@/app/app/onboarding/page";
import {requireUser} from "@/lib/auth/user";
import {monthlyMinor, PLAN, pounds} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, ownedOrganisations} from "@/lib/billing/stripe";

export const metadata = {title: "New workspace"};

export default async function NewWorkspace({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {user} = await requireUser();
  let note: string | undefined;
  if (billingEnabled() && !(await billingAccount(user.id))?.comped) {
    const owned = await ownedOrganisations(user.id);
    note =
      owned < PLAN.includedOrganisations
        ? `Its first business is included in your plan of up to ${PLAN.includedOrganisations} organisations for ${pounds(PLAN.baseMinor)} a month.`
        : `Its first business adds ${pounds(PLAN.extraOrganisationMinor)} a month to your plan, making it ${pounds(monthlyMinor(owned + 1))} a month.`;
  }
  return (
    <WorkspaceForm
      params={await searchParams}
      returnPath="/app/workspaces/new"
      title="Create a workspace"
      note={note}
      askWorkspaceName
    />
  );
}
