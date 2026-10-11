import {describe, expect, it} from "vitest";
import type {ErrorEvent} from "@sentry/nextjs";
import {scrubEvent, sentryOptions} from "@/lib/monitoring/sentry-options";

describe("what goes to Sentry", () => {
  it("blanks out email addresses and drops request details", () => {
    const event = scrubEvent({
      type: undefined,
      message: "Invite to jo.bloggs@example.co.uk failed",
      exception: {values: [{type: "Error", value: "No profile for sam@shop.com"}]},
      breadcrumbs: [{message: "Signed in as sam@shop.com"}],
      user: {id: "u1", email: "sam@shop.com", ip_address: "1.2.3.4"},
      request: {
        url: "https://www.metricmage.co.uk/app",
        cookies: {sb: "secret"},
        headers: {authorization: "Bearer x"},
        data: {password: "x"},
        query_string: "token=abc",
      },
    } as ErrorEvent);
    expect(event.message).toBe("Invite to [email] failed");
    expect(event.exception?.values?.[0].value).toBe("No profile for [email]");
    expect(event.breadcrumbs?.[0].message).toBe("Signed in as [email]");
    expect(event.user).toEqual({id: "u1"});
    expect(event.request).toEqual({
      url: "https://www.metricmage.co.uk/app",
      query_string: "[removed]",
    });
  });

  it("stays off without a DSN and never sends default personal data", () => {
    expect(sentryOptions.sendDefaultPii).toBe(false);
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) expect(sentryOptions.enabled).toBe(false);
  });
});
