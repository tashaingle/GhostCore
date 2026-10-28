import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {createServiceClient} from "@/lib/supabase/service";

const BUCKET = "organisation-documents";

export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const ctx = await getActiveOrganisation();
  const service = createServiceClient();
  const {data: document} = await service.from("organisation_documents")
    .select("organisation_id,storage_path").eq("id", id).maybeSingle();
  if (!document || !ctx.organisations.some((item) => item.id === document.organisation_id))
    redirect("/app/documents?error=That%20document%20could%20not%20be%20found.");
  const {data, error} = await service.storage.from(BUCKET).createSignedUrl(document.storage_path, 60);
  if (error || !data?.signedUrl) redirect("/app/documents?error=That%20document%20could%20not%20be%20downloaded.");
  redirect(data.signedUrl);
}
