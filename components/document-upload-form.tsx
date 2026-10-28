"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {Upload} from "lucide-react";
import {cleanupDocumentUpload} from "@/app/document-actions";
import {createClient} from "@/lib/supabase/client";

const BUCKET = "organisation-documents";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "image/jpeg", "image/png", "image/webp", "application/zip",
]);

function safeName(name: string) {
  return name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-180) || "document";
}

export function DocumentUploadForm({organisationId, userId}: {organisationId: string; userId: string}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const file = formData.get("file");
    if (!title || !(file instanceof File) || !file.size) return setError("Choose a document and give it a title.");
    if (file.size > MAX_BYTES) return setError("Documents must be 25 MB or smaller.");
    if (!ALLOWED.has(file.type)) return setError("That file type is not supported.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    const storagePath = `${organisationId}/${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const {error: uploadError} = await supabase.storage.from(BUCKET).upload(storagePath, file, {contentType: file.type, upsert: false});
    if (uploadError) {
      setBusy(false);
      return setError(uploadError.message);
    }
    const {error: insertError} = await supabase.from("organisation_documents").insert({
      organisation_id: organisationId,
      title: title.slice(0, 200),
      file_name: file.name.slice(0, 255),
      storage_path: storagePath,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by: userId,
    });
    if (insertError) {
      const cleanup = new FormData();
      cleanup.set("organisationId", organisationId);
      cleanup.set("storagePath", storagePath);
      await cleanupDocumentUpload(cleanup);
      setBusy(false);
      return setError("The file uploaded but could not be added to the library.");
    }
    router.push(`/app/documents?project=${organisationId}&success=Document%20uploaded.`);
    router.refresh();
  }

  return <form action={submit} className="mt-4 space-y-4">
    <label className="label">Document title<input className="field" name="title" required maxLength={200} placeholder="e.g. Investor deck" disabled={busy} /></label>
    <label className="label">Choose file<input className="field file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold" type="file" name="file" required disabled={busy} /></label>
    {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <button className="button w-full" disabled={busy}><Upload aria-hidden className="h-4 w-4" />{busy ? "Uploading…" : "Upload document"}</button>
  </form>;
}
