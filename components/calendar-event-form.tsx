"use client";

import {useEffect, useMemo, useState} from "react";
import {CalendarPlus, UsersRound, Video} from "lucide-react";
import {addCalendarEvent} from "@/app/calendar-event-actions";

type Project = {id: string; name: string; people: {userId: string; label: string}[]};

export function CalendarEventForm({projects, activeId}: {projects: Project[]; activeId: string}) {
  const [projectId, setProjectId] = useState(activeId);
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  useEffect(() => setTimezoneOffset(new Date().getTimezoneOffset()), []);
  const people = useMemo(
    () => projects.find((project) => project.id === projectId)?.people ?? [],
    [projectId, projects],
  );
  return (
    <details id="add-event" className="mm-panel group mb-5 rounded-2xl p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarPlus aria-hidden className="h-5 w-5" /></span>
          <div><h2 className="font-semibold text-zinc-950">Add a team event</h2><p className="text-xs text-zinc-500">Add a call, meeting or deadline everyone can see.</p></div>
        </div>
        <span className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white">New event</span>
      </summary>
      <form action={addCalendarEvent} className="mt-5 grid gap-4 border-t border-zinc-100 pt-5 md:grid-cols-2">
        <input type="hidden" name="timezoneOffset" value={timezoneOffset} />
        <label className="label md:col-span-2">Event title<input className="field" name="title" placeholder="Tzkia team call" maxLength={160} required /></label>
        <label className="label">Project<select className="field" name="organisationId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="label">Date and time<input className="field" type="datetime-local" name="startAt" required /></label>
        <label className="label">Length<select className="field" name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1½ hours</option><option value="120">2 hours</option></select></label>
        <label className="label"><span className="inline-flex items-center gap-1.5"><Video aria-hidden className="h-4 w-4" />Teams joining link</span><input className="field" type="url" name="teamsUrl" placeholder="https://teams.microsoft.com/l/meetup-join/…" /></label>
        <fieldset className="rounded-xl bg-zinc-50 p-4 md:col-span-2">
          <legend className="px-1 text-xs font-semibold text-zinc-700"><span className="inline-flex items-center gap-1.5"><UsersRound aria-hidden className="h-4 w-4" />Who is attending?</span></legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{people.map((person) => <label key={`${projectId}-${person.userId}`} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-zinc-700 ring-1 ring-zinc-200"><input type="checkbox" name="attendee" value={person.userId} defaultChecked className="h-4 w-4 rounded border-zinc-300 text-blue-600" />{person.label}</label>)}</div>
        </fieldset>
        <label className="label md:col-span-2">Notes<textarea className="field min-h-24 resize-y" name="notes" maxLength={2000} placeholder="What should everyone prepare?" /></label>
        <button className="button justify-center md:col-span-2 md:justify-self-start"><CalendarPlus aria-hidden className="h-4 w-4" />Add to calendar</button>
      </form>
    </details>
  );
}
