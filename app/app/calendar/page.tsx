import Link from "next/link";
import {UpcomingCalendar} from "@/components/upcoming-calendar";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {sortProjects} from "@/lib/home/projects";

export const metadata = {title: "Calendar"};

export default async function CalendarPage() {
  const ctx = await getActiveOrganisation();
  const projects = sortProjects(ctx.organisations);
  const ids = projects.map((project) => project.id);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const now = new Date();
  const {data: events} = ids.length
    ? await ctx.supabase
        .from("events")
        .select("id,title,occurred_at,organisation_id,metadata")
        .in("organisation_id", ids)
        .eq("source", "google_calendar")
        .neq("event_type", "google_calendar.event_cancelled")
        .gte("occurred_at", now.toISOString())
        .lte("occurred_at", new Date(now.getTime() + 30 * 86_400_000).toISOString())
        .order("occurred_at", {ascending: true})
        .limit(50)
    : {data: []};
  const upcoming = (events ?? []).map((event) => {
    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {};
    return {
      id: event.id,
      title: event.title,
      startsAt: event.occurred_at,
      organisationName: names.get(event.organisation_id),
      location: typeof metadata.location === "string" ? metadata.location : null,
      allDay: metadata.allDay === true,
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
            Schedule
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">Calendar</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your next 30 days across every connected project.
          </p>
        </div>
        <Link
          href="/app/integrations/google-calendar/settings"
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition-colors hover:text-zinc-950"
        >
          Calendar settings
        </Link>
      </header>
      <UpcomingCalendar items={upcoming} now={now} limit={50} />
    </div>
  );
}
