import Link from "next/link";
import {CalendarDays, ChevronRight, Clock3, MapPin, Video} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationsPeople} from "@/lib/organisations/people";
import {sortProjects} from "@/lib/home/projects";
import {CalendarEventForm} from "@/components/calendar-event-form";
import {Notice} from "@/components/notice";

export const metadata = {title: "Calendar"};

const dayKey = (date: Date) => date.toLocaleDateString("en-CA");

export default async function CalendarPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const ctx = await getActiveOrganisation();
  const params = await searchParams;
  const projects = sortProjects(ctx.organisations);
  const ids = projects.map((project) => project.id);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const peopleByOrg = await organisationsPeople(ctx.supabase, ids, ctx.user.id);
  const peopleNames = new Map<string, string>();
  for (const lookup of peopleByOrg.values()) for (const person of lookup.list) peopleNames.set(person.userId, person.label);
  const now = new Date();
  const {data: events} = ids.length
    ? await ctx.supabase
        .from("events")
        .select("id,title,occurred_at,organisation_id,metadata")
        .in("organisation_id", ids)
        .in("source", ["google_calendar", "manual_calendar"])
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
      teamsUrl: typeof metadata.teamsUrl === "string" ? metadata.teamsUrl : null,
      attendeeNames: Array.isArray(metadata.attendeeIds)
        ? metadata.attendeeIds.filter((id): id is string => typeof id === "string").map((id) => peopleNames.get(id) ?? "Team member")
        : [],
    };
  });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((monthStart.getDay() + 6) % 7));
  const days = Array.from({length: 42}, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const byDay = new Map<string, typeof upcoming>();
  for (const event of upcoming) {
    const key = dayKey(new Date(event.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <div className="mm-page mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            Your time
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
      <Notice searchParams={params} />
      <CalendarEventForm
        activeId={ctx.organisation.id}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          people: (peopleByOrg.get(project.id)?.list ?? []).map((person) => ({userId: person.userId, label: person.label})),
        }))}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="mm-panel hidden overflow-hidden rounded-2xl md:block">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <p className="text-xs font-medium text-zinc-500">Month view</p>
              <h2 className="mt-0.5 text-lg font-semibold text-zinc-950">{now.toLocaleDateString("en-GB", {month: "long", year: "numeric"})}</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarDays aria-hidden className="h-5 w-5" /></span>
          </div>
          <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/80 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <div key={day} className="py-2.5">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((date) => {
              const key = dayKey(date);
              const dayEvents = byDay.get(key) ?? [];
              const currentMonth = date.getMonth() === now.getMonth();
              const today = key === dayKey(now);
              return (
                <div key={key} className={`min-h-24 border-b border-r border-zinc-100 p-2 transition-colors hover:bg-blue-50/30 ${currentMonth ? "bg-white" : "bg-zinc-50/60"}`}>
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${today ? "bg-ink text-white" : currentMonth ? "text-zinc-700" : "text-zinc-300"}`}>{date.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map((event) => <p key={event.id} className="truncate rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-medium text-blue-700">{event.title}</p>)}
                    {dayEvents.length > 2 ? <p className="px-1 text-[10px] text-zinc-400">+{dayEvents.length - 2} more</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="mm-panel h-fit overflow-hidden rounded-2xl">
          <div className="border-b border-zinc-100 px-5 py-4"><p className="text-xs font-medium text-blue-600">Coming up</p><h2 className="mt-0.5 font-semibold text-zinc-950">Next events</h2></div>
          {upcoming.length ? (
            <ul className="divide-y divide-zinc-100">
              {upcoming.slice(0, 8).map((event) => (
                <li key={event.id} className="group px-5 py-4 transition-colors hover:bg-zinc-50/70">
                  <div className="flex items-start gap-3">
                    <div className="w-11 shrink-0 rounded-xl bg-blue-50 py-2 text-center"><p className="text-[10px] font-semibold uppercase text-blue-500">{new Date(event.startsAt).toLocaleDateString("en-GB", {month:"short"})}</p><p className="text-lg font-semibold leading-none text-blue-800">{new Date(event.startsAt).getDate()}</p></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-900">{event.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><Clock3 aria-hidden className="h-3 w-3" />{event.allDay ? "All day" : new Date(event.startsAt).toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}</p>{event.location ? <p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-400"><MapPin aria-hidden className="h-3 w-3" />{event.location}</p> : null}{event.attendeeNames.length ? <p className="mt-1 truncate text-xs text-zinc-400">{event.attendeeNames.join(", ")}</p> : null}{event.teamsUrl ? <a href={event.teamsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"><Video aria-hidden className="h-3 w-3" />Join Teams</a> : null}</div>
                    <ChevronRight aria-hidden className="mt-2 h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="px-5 py-12 text-center"><p className="font-medium text-zinc-800">Your diary is clear</p><p className="mt-1 text-sm text-zinc-500">Upcoming events will appear here.</p></div>}
        </aside>
      </div>
    </div>
  );
}
