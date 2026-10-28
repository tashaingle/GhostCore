"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {createEvent} from "@/lib/events/create-event";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(160),
  organisationId: z.uuid(),
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezoneOffset: z.coerce.number().int().min(-840).max(840),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  teamsUrl: z.union([z.literal(""), z.url().startsWith("https://")]),
  notes: z.string().trim().max(2000),
});

function fail(message: string): never {
  redirect(`/app/calendar?error=${encodeURIComponent(message)}`);
}

export async function addCalendarEvent(form: FormData) {
  const parsed = eventSchema.safeParse({
    title: form.get("title"),
    organisationId: form.get("organisationId"),
    startAt: form.get("startAt"),
    timezoneOffset: form.get("timezoneOffset"),
    durationMinutes: form.get("durationMinutes"),
    teamsUrl: form.get("teamsUrl"),
    notes: form.get("notes"),
  });
  if (!parsed.success) fail("Check the event details and try again.");
  const ctx = await getActiveOrganisation();
  const project = ctx.organisations.find((item) => item.id === parsed.data.organisationId);
  if (!project) fail("Choose one of your projects.");
  if (!hasPermission(project.role as OrganisationRole, "event.create"))
    fail("You do not have permission to add events to this project.");

  const people = await organisationPeople(ctx.supabase, project.id);
  const allowed = new Set(people.list.map((person) => person.userId));
  const attendeeIds = [...new Set(form.getAll("attendee").map(String))].filter((id) => allowed.has(id));
  if (!attendeeIds.length) fail("Choose at least one attendee.");

  const localAsUtc = new Date(`${parsed.data.startAt}:00Z`);
  const startsAt = new Date(localAsUtc.getTime() + parsed.data.timezoneOffset * 60_000);
  if (!Number.isFinite(startsAt.getTime())) fail("Choose a valid date and time.");

  const result = await createEvent(ctx.supabase, ctx.user.id, {
    organisationId: project.id,
    source: "manual_calendar",
    category: "calendar",
    eventType: "manual_calendar.event_created",
    title: parsed.data.title,
    description: parsed.data.notes || null,
    severity: "info",
    occurredAt: startsAt.toISOString(),
    metadata: {
      teamsUrl: parsed.data.teamsUrl || null,
      attendeeIds,
      durationMinutes: parsed.data.durationMinutes,
      createdBy: ctx.user.id,
      allDay: false,
    },
  });
  if (!result.ok) fail(result.message);
  revalidatePath("/app/calendar");
  redirect("/app/calendar?success=Event%20added%20to%20the%20team%20calendar.");
}
