import {Mail, MapPin, MessageSquareText, Smartphone, Star, UserRound} from "lucide-react";
import {addEmailContact, updateEmailContactFeedback} from "@/app/email-contact-actions";
import {Notice} from "@/components/notice";
import {getActiveOrganisation} from "@/lib/organisations/active";

export const metadata = {title: "Email list"};

const PLATFORM = {ios: "iOS", android: "Android", other: "Other", unknown: "Unknown"} as const;
const TESTING_STATUS = {
  testing: "Currently testing",
  invited: "Invited",
  paused: "Paused",
  completed: "Completed",
  not_testing: "Not testing",
} as const;

export default async function EmailListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const {data: contacts} = await ctx.supabase
    .from("email_contacts")
    .select("id,name,email,source,platform,testing_status,review_rating,testing_review,created_at")
    .eq("organisation_id", ctx.organisation.id)
    .order("created_at", {ascending: false})
    .limit(500);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Audience</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Email list</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track testers, platforms, participation and feedback in one place.
        </p>
      </header>
      <Notice searchParams={params} />

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <UserRound aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-zinc-950">Add a contact</h2>
            <p className="text-xs text-zinc-500">Add the details you know now.</p>
          </div>
        </div>
        <form action={addEmailContact} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="label">
            Name
            <input
              className="field"
              name="name"
              maxLength={160}
              placeholder="Alex Smith"
              required
            />
          </label>
          <label className="label">
            Email
            <input
              className="field"
              name="email"
              type="email"
              maxLength={320}
              placeholder="alex@example.com"
              required
            />
          </label>
          <label className="label">
            Where they&apos;re from
            <input
              className="field"
              name="source"
              maxLength={160}
              placeholder="Instagram, event, London…"
              required
            />
          </label>
          <label className="label">
            Platform
            <select className="field" name="platform" defaultValue="unknown">
              <option value="unknown">Not known yet</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="label">
            Testing status
            <select className="field" name="testing_status" defaultValue="testing">
              <option value="testing">Currently testing</option>
              <option value="invited">Invited</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="not_testing">Not testing</option>
            </select>
          </label>
          <label className="label">
            Rating (optional)
            <select className="field" name="review_rating" defaultValue="">
              <option value="">No rating yet</option>
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>
              ))}
            </select>
          </label>
          <label className="label md:col-span-2">
            App testing review (optional)
            <textarea
              className="field min-h-24 resize-y"
              name="testing_review"
              maxLength={2000}
              placeholder="What did they like, what broke, and what should change?"
            />
          </label>
          <button className="button md:col-span-2 md:justify-self-start xl:col-span-4">
            Add to list
          </button>
        </form>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-950">Contacts</h2>
            <p className="text-xs text-zinc-500">{contacts?.length ?? 0} on this project</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-50 text-zinc-500">
            <Mail aria-hidden className="h-[18px] w-[18px]" />
          </span>
        </div>
        {contacts?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Testing</th>
                  <th className="px-5 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-t border-zinc-100 hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5 font-medium text-zinc-950">{contact.name}</td>
                    <td className="px-4 py-3.5 text-zinc-600">{contact.email}</td>
                    <td className="px-4 py-3.5 text-zinc-600">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden className="h-3.5 w-3.5 text-zinc-400" />
                        {contact.source}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        <Smartphone aria-hidden className="h-3.5 w-3.5" />
                        {PLATFORM[contact.platform]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${contact.testing_status === "testing" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                        {TESTING_STATUS[contact.testing_status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      <details className="group min-w-56">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-blue-700">
                          {contact.review_rating ? (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Star aria-hidden className="h-3.5 w-3.5 fill-current" /> {contact.review_rating}/5
                            </span>
                          ) : (
                            <><MessageSquareText aria-hidden className="h-4 w-4" /> Add review</>
                          )}
                        </summary>
                        <form action={updateEmailContactFeedback} className="mt-3 grid gap-2 rounded-xl bg-zinc-50 p-3">
                          <input type="hidden" name="id" value={contact.id} />
                          <select className="field" name="testing_status" defaultValue={contact.testing_status} aria-label={`Testing status for ${contact.name}`}>
                            {Object.entries(TESTING_STATUS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <select className="field" name="review_rating" defaultValue={contact.review_rating ?? ""} aria-label={`Rating for ${contact.name}`}>
                            <option value="">No rating</option>
                            {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                          </select>
                          <textarea className="field min-h-20 resize-y" name="testing_review" maxLength={2000} defaultValue={contact.testing_review ?? ""} placeholder="Testing notes and review" aria-label={`Testing review for ${contact.name}`} />
                          <button className="button justify-center">Save</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="font-medium text-zinc-800">No contacts yet</p>
            <p className="mt-1 text-sm text-zinc-500">Add the first person using the form above.</p>
          </div>
        )}
      </section>
    </div>
  );
}
