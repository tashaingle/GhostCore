import type {IntegrationConnector, IntegrationSyncContext} from "../connector";
import {CalendarClient, CalendarError} from "./client";
import {translateCalendar} from "./translator";
import type {CalendarEvent, CalendarSettings} from "./types";
export class GoogleCalendarConnector implements IntegrationConnector<CalendarEvent> {
  readonly provider = "google_calendar";
  private error?: unknown;
  constructor(
    private client: CalendarClient,
    private settings: CalendarSettings,
  ) {}
  connect = async () => ({ok: true});
  // Google grants one permission per Google account, shared by every Metric Mage connection that
  // uses it (Gmail, Calendar, Analytics, Search Console, in any organisation). Revoking it on
  // disconnect would cut off all of them, so disconnecting only deletes this connection's stored
  // sign-in. People can remove Metric Mage entirely from their Google Account's security settings.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.calendars();
      return "healthy" as const;
    } catch (e) {
      this.error = e;
      return e instanceof CalendarError && e.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate() {
    return null;
  }
  async sync(ctx: IntegrationSyncContext) {
    const calendars = (this.settings.calendars ?? []).filter((c) => c.selected).slice(0, 20),
      fingerprints = {...(this.settings.fingerprints ?? {})},
      events = [],
      updated = [];
    let received = 0,
      pages = 0,
      failed = 0;
    for (const calendar of calendars) {
      try {
        let result;
        try {
          result = await this.client.events(calendar, calendar.syncToken);
        } catch (e) {
          if (e instanceof CalendarError && e.kind === "gone")
            result = await this.client.events(calendar);
          else throw e;
        }
        received += result.events.length;
        pages += result.pages;
        for (const item of result.events) {
          const key = `${calendar.id}:${item.id}`,
            translated = translateCalendar(
              item,
              calendar,
              {...ctx, receivedAt: ctx.receivedAt ?? new Date().toISOString()},
              this.settings,
              fingerprints[key],
            );
          if (translated) {
            events.push(translated.event);
            fingerprints[key] = translated.fingerprint;
          }
        }
        updated.push({...calendar, syncToken: result.syncToken ?? calendar.syncToken});
      } catch {
        failed++;
      }
    }
    return {
      received,
      events,
      credentials: this.client.credentialUpdate(),
      settings: {
        ...this.settings,
        calendars: updated,
        fingerprints: Object.fromEntries(Object.entries(fingerprints).slice(-2000)),
        lastSyncMode: "calendar_incremental",
        calendarFailures: failed,
      },
      pages,
      filtered: received - events.length,
    };
  }
}
