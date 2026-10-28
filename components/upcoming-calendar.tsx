import Link from "next/link";
import {CalendarDays, Clock3, MapPin} from "lucide-react";

export type UpcomingCalendarItem = {
  id: string;
  title: string;
  startsAt: string;
  organisationName?: string;
  location?: string | null;
  allDay?: boolean;
};

function dayLabel(value: string, now: Date) {
  const date = new Date(value);
  const today = now.toLocaleDateString("en-CA");
  const tomorrow = new Date(now.getTime() + 86_400_000).toLocaleDateString("en-CA");
  const key = date.toLocaleDateString("en-CA");
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return date.toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"});
}

export function UpcomingCalendar({
  items,
  now,
  limit = 6,
}: {
  items: UpcomingCalendarItem[];
  now: Date;
  limit?: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-[#0b1830] text-white shadow-lg shadow-slate-950/10">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-300">
            Your week
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">Calendar</h2>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-sky-200">
          <CalendarDays aria-hidden className="h-[18px] w-[18px]" />
        </span>
      </div>
      {items.length ? (
        <ul className="divide-y divide-white/10">
          {items.slice(0, limit).map((item) => (
            <li key={item.id} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold text-sky-300">{dayLabel(item.startsAt, now)}</p>
                <p className="inline-flex items-center gap-1 text-[11px] text-white/50">
                  <Clock3 aria-hidden className="h-3 w-3" />
                  {item.allDay
                    ? "All day"
                    : new Date(item.startsAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                </p>
              </div>
              <p className="mt-1 text-sm font-medium leading-snug text-white">{item.title}</p>
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-white/50">
                {item.location ? <MapPin aria-hidden className="h-3 w-3 shrink-0" /> : null}
                {[item.location, item.organisationName].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-6">
          <p className="text-sm font-medium">A clear diary.</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Upcoming Google Calendar events will appear here after your next sync.
          </p>
        </div>
      )}
      <Link
        href="/app/integrations/google-calendar/settings"
        className="block border-t border-white/10 px-4 py-3 text-xs font-medium text-sky-300 transition-colors hover:bg-white/5 hover:text-sky-200"
      >
        Calendar settings →
      </Link>
    </section>
  );
}
