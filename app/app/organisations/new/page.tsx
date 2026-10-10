import {WorkspaceForm} from "@/app/app/onboarding/page";
import {requireUser} from "@/lib/auth/user";
import {monthlyMinor, PLAN, pounds} from "@/lib/billing/plan";
import {billingAccount, billingEnabled, ownedOrganisations} from "@/lib/billing/stripe";

export default async function NewOrganisation({
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
        ? `Included in your plan: you can have up to ${PLAN.includedOrganisations} organisations for ${pounds(PLAN.baseMinor)} a month.`
        : `This adds ${pounds(PLAN.extraOrganisationMinor)} a month to your plan, making it ${pounds(monthlyMinor(owned + 1))} a month.`;
  }
  return (
    <WorkspaceForm
      params={await searchParams}
      returnPath="/app/organisations/new"
      title="Create another organisation"
      note={note}
    />
  );
}
