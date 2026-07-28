import {WorkspaceForm} from "@/app/app/onboarding/page";
export default async function NewOrganisation({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <WorkspaceForm params={await searchParams} returnPath="/app/organisations/new" title="Create another organisation"/>}
