import {describe, expect, it} from "vitest";
import {GmailConnector} from "@/lib/integrations/gmail/connector";
import {GmailClient} from "@/lib/integrations/gmail/client";
import {GoogleCalendarConnector} from "@/lib/integrations/google-calendar/connector";
import {CalendarClient} from "@/lib/integrations/google-calendar/client";
import {GoogleAnalyticsConnector} from "@/lib/integrations/google-analytics/connector";
import {GoogleAnalyticsClient} from "@/lib/integrations/google-analytics/client";
import {GoogleSearchConsoleConnector} from "@/lib/integrations/google-search-console/connector";
import {SearchConsoleClient} from "@/lib/integrations/google-search-console/client";

// Google shares one permission across every connection using the same Google account, so a
// disconnect must never call Google's revoke endpoint: that would cut off all the others too.
describe("disconnecting a Google tool", () => {
  it("never contacts Google, so other connections on the same account keep working", async () => {
    const calls: string[] = [];
    const request = (async (input: URL | RequestInfo) => {
      calls.push(String(input));
      return new Response("{}");
    }) as typeof fetch;
    const credentials = {accessToken: "t", refreshToken: "r", expiresAt: "2999-01-01T00:00:00Z"};
    const connectors = [
      new GmailConnector(new GmailClient(credentials, request), {}),
      new GoogleCalendarConnector(new CalendarClient(credentials as never, request), {} as never),
      new GoogleAnalyticsConnector(new GoogleAnalyticsClient(credentials, request), {} as never),
      new GoogleSearchConsoleConnector(new SearchConsoleClient(credentials, request), {} as never),
    ];
    for (const connector of connectors)
      expect(await connector.disconnect()).toEqual({
        ok: true,
      });
    expect(calls).toEqual([]);
  });
});
