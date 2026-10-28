"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {createServiceClient} from "@/lib/supabase/service";

const BUCKET = "organisation-documents";

function fail(message: string, project?: string): never {
  const query = new URLSearchParams({error: message});
  if (project) query.set("project", project);
  redirect(`/app/documents?${query}`);
}

export async function cleanupDocumentUpload(form: FormData) {
  const organisationId = z.uuid().safeParse(form.get("organisationId"));
  const storagePath = z.string().max(500).safeParse(form.get("storagePath"));
  if (!organisationId.success || !storagePath.success) return;
  const ctx = await getActiveOrganisation();
  const project = ctx.organisations.find((item) => item.id === organisationId.data);
  const expectedPrefix = `${organisationId.data}/${ctx.user.id}/`;
  if (!project || !storagePath.data.startsWith(expectedPrefix)) return;
  await createServiceClient().storage.from(BUCKET).remove([storagePath.data]);
}

export async function deleteDocument(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  const organisationId = z.uuid().safeParse(form.get("organisationId"));
  if (!id.success || !organisationId.success) fail("That document could not be found.");
  const ctx = await getActiveOrganisation();
  const project = ctx.organisations.find((item) => item.id === organisationId.data);
  if (!project || !hasPermission(project.role as OrganisationRole, "work.manage"))
    fail("Only managers can delete documents.", organisationId.data);
  const service = createServiceClient();
  const {data: document} = await service.from("organisation_documents")
    .select("storage_path").eq("id", id.data).eq("organisation_id", project.id).maybeSingle();
  if (!document) fail("That document could not be found.", project.id);
  const {error: storageError} = await service.storage.from(BUCKET).remove([document.storage_path]);
  if (storageError) fail("The stored file could not be deleted.", project.id);
  const {error} = await service.from("organisation_documents").delete()
    .eq("id", id.data).eq("organisation_id", project.id);
  if (error) fail("The document record could not be deleted.", project.id);
  revalidatePath("/app/documents");
  redirect(`/app/documents?project=${project.id}&success=Document%20deleted.`);
}
