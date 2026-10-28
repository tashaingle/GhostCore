import Link from "next/link";
import {Activity, Apple, Bot, Mail, MapPin, MessageSquareText, Plus, Smartphone, Star, UsersRound} from "lucide-react";
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
  not_confirmed: "Not confirmed",
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
  const all = contacts ?? [];
  const requestedPlatform = typeof params.platform === "string" ? params.platform : "all";
  const platform = ["all", "ios", "android"].includes(requestedPlatform) ? requestedPlatform : "all";
  const shown = platform === "all" ? all : all.filter((contact) => contact.platform === platform);
  const counts = {
    total: all.length,
    ios: all.filter((contact) => contact.platform === "ios").length,
    android: all.filter((contact) => contact.platform === "android").length,
    testing: all.filter((contact) => contact.testing_status === "testing").length,
    reviewed: all.filter((contact) => contact.review_rating || contact.testing_review).length,
  };

  return (
    <div className="mm-page mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Beta team</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Testers</h1>
          <p className="mt-1 text-sm text-zinc-500">A simple view of who is testing, where they are and what they think.</p>
        </div>
        <a href="#add-tester" className="button rounded-xl"><Plus aria-hidden className="h-4 w-4" /> Add tester</a>
      </header>
      <Notice searchParams={params} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {label: "All testers", value: counts.total, note: "Across both platforms", icon: UsersRound, tone: "bg-blue-50 text-blue-600"},
          {label: "Apple", value: counts.ios, note: "Target 12", icon: Apple, tone: "bg-zinc-100 text-zinc-700"},
          {label: "Android", value: counts.android, note: "Target 12", icon: Bot, tone: "bg-emerald-50 text-emerald-600"},
          {label: "Currently testing", value: counts.testing, note: `${counts.reviewed} with feedback`, icon: Activity, tone: "bg-violet-50 text-violet-600"},
        ].map((item) => (
          <article key={item.label} className="mm-panel rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium text-zinc-500">{item.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-950">{item.value}</p></div>
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${item.tone}`}><item.icon aria-hidden className="h-[18px] w-[18px]" /></span>
            </div>
            <p className="mt-2 text-xs text-zinc-400">{item.note}</p>
          </article>
        ))}
      </section>

      <details id="add-tester" className="mm-panel group mt-5 rounded-2xl p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <div><h2 className="font-semibold text-zinc-950">Add a tester</h2><p className="text-xs text-zinc-500">Add the details you know now.</p></div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 transition-transform group-open:rotate-45"><Plus aria-hidden className="h-4 w-4" /></span>
        </summary>
        <form action={addEmailContact} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <select className="field" name="testing_status" defaultValue="not_confirmed">
              <option value="not_confirmed">Not confirmed</option>
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
      </details>

      <section className="mm-panel mt-5 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-950">Your testing team</h2>
            <p className="text-xs text-zinc-500">{shown.length} shown</p>
          </div>
          <div className="flex rounded-xl bg-zinc-100 p-1">
            {[{value:"all",label:"All"},{value:"ios",label:"Apple"},{value:"android",label:"Android"}].map((tab) => (
              <Link key={tab.value} href={tab.value === "all" ? "/app/email-list" : `/app/email-list?platform=${tab.value}`} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${platform === tab.value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}>{tab.label}</Link>
            ))}
          </div>
        </div>
        {shown.length ? (
          <>
            <div className="divide-y divide-zinc-100 md:hidden">
              {shown.map((contact) => (
                <article key={contact.id} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-950">{contact.name}</h3>
                      <a href={`mailto:${contact.email}`} className="mt-0.5 block truncate text-sm text-blue-600">{contact.email}</a>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      <Smartphone aria-hidden className="h-3.5 w-3.5" />
                      {PLATFORM[contact.platform]}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-zinc-500"><MapPin aria-hidden className="h-3.5 w-3.5 text-zinc-400" />{contact.source}</span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 font-medium ${contact.testing_status === "testing" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{TESTING_STATUS[contact.testing_status]}</span>
                  </div>
                  <details className="group mt-4 rounded-xl bg-zinc-50 p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-blue-700 [&::-webkit-details-marker]:hidden">
                      {contact.review_rating ? <><Star aria-hidden className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {contact.review_rating}/5 · Edit review</> : <><MessageSquareText aria-hidden className="h-4 w-4" /> Add review</>}
                    </summary>
                    <form action={updateEmailContactFeedback} className="mt-3 grid gap-2">
                      <input type="hidden" name="id" value={contact.id} />
                      <select className="field" name="testing_status" defaultValue={contact.testing_status} aria-label={`Testing status for ${contact.name}`}>
                        {Object.entries(TESTING_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select className="field" name="review_rating" defaultValue={contact.review_rating ?? ""} aria-label={`Rating for ${contact.name}`}>
                        <option value="">No rating</option>
                        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                      </select>
                      <textarea className="field min-h-20 resize-y" name="testing_review" maxLength={2000} defaultValue={contact.testing_review ?? ""} placeholder="Testing notes and review" aria-label={`Testing review for ${contact.name}`} />
                      <button className="button justify-center">Save review</button>
                    </form>
                  </details>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
                {shown.map((contact) => (
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
          </>
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
