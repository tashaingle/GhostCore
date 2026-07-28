import{describe,it,expect}from"vitest";
import{providerRegistry}from"@/lib/integrations/registry";
import{CALENDAR_SCOPES,stateMatches,challenge}from"@/lib/integrations/google-calendar/oauth";
import{calendarFingerprint,translateCalendar}from"@/lib/integrations/google-calendar/translator";
const calendar={id:"primary",summary:"Work",primary:true,accessRole:"owner"};
const event={id:"e1",summary:"<b>Planning</b>",status:"confirmed",start:{dateTime:"2026-07-28T10:00:00+01:00",timeZone:"Europe/London"},end:{dateTime:"2026-07-28T11:00:00+01:00"},attendees:[{self:true,responseStatus:"accepted"}],recurringEventId:"series"};
describe("Google Calendar",()=>{
it("registers a real connector",()=>expect(providerRegistry.google_calendar.connector).toBe("google_calendar"));
it("uses narrow read scopes",()=>{expect(CALENDAR_SCOPES.join(" ")).toContain("events.readonly");expect(CALENDAR_SCOPES).not.toContain("https://www.googleapis.com/auth/calendar")});
it("validates state and PKCE",()=>{expect(stateMatches("a","a")).toBe(true);expect(stateMatches("a","b")).toBe(false);expect(challenge("x")).toHaveLength(43)});
it("creates sanitized recurring events",()=>{const x=translateCalendar(event,calendar,{organisationId:"o",integrationId:"i",receivedAt:"x"},{includeTentative:true,includeCancelled:true});expect(x?.event.title).toBe("b Planning /b");expect(x?.event.metadata).toMatchObject({recurring:true,allDay:false,responseStatus:"accepted"})});
it("distinguishes updates",()=>{const fp=calendarFingerprint(event);expect(translateCalendar({...event,summary:"Changed"},calendar,{organisationId:"o",integrationId:"i",receivedAt:"x"},{},fp)?.event.eventType).toBe("google_calendar.event_updated")});
it("handles all-day cancellations",()=>{const x=translateCalendar({...event,status:"cancelled",start:{date:"2026-07-28"},end:{date:"2026-07-29"}},calendar,{organisationId:"o",integrationId:"i",receivedAt:"x"},{includeCancelled:true});expect(x?.event.metadata).toMatchObject({allDay:true,status:"cancelled"})});
it("filters declined",()=>expect(translateCalendar({...event,attendees:[{self:true,responseStatus:"declined"}]},calendar,{organisationId:"o",integrationId:"i",receivedAt:"x"},{includeDeclined:false})).toBeNull());
});
