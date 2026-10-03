import {afterEach, describe, expect, it, vi} from "vitest";
import {providerRegistry} from "@/lib/integrations/registry";
import {outlookAuthorisationUrl, OUTLOOK_SCOPES} from "@/lib/integrations/outlook/oauth";
import {OutlookClient} from "@/lib/integrations/outlook/client";
import {OutlookConnector} from "@/lib/integrations/outlook/connector";
import {outlookDirection, translateOutlook} from "@/lib/integrations/outlook/translator";
import type {OutlookMessage} from "@/lib/integrations/outlook/types";

const context = {organisationId: "o", integrationId: "i", receivedAt: "2026-10-03T12:00:00Z"};
const mailbox = "tasha@hutchandco.co.uk";
const message = (over: Partial<OutlookMessage> = {}): OutlookMessage => ({
  id: "m1",
  conversationId: "c1",
  subject: "Large hutch: delivery date?",
  from: {emailAddress: {name: "Sam Customer", address: "Sam@Example.com"}},
  toRecipients: [{emailAddress: {address: mailbox}}],
  receivedDateTime: "2026-10-03T09:00:00Z",
  sentDateTime: "2026-10-03T08:59:00Z",
  isRead: false,
  hasAttachments: true,
  ...over,
});

describe("Outlook", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is a read-only, hourly connection", () => {
    const outlook = providerRegistry.outlook;
    expect(outlook.connectPath).toBe("/api/integrations/outlook/connect");
    expect(outlook.capabilities).toContain("read_only");
    expect(outlook.schedule).toBe("hourly");
  });

  it("asks Microsoft only for basic mail access, with PKCE and an account picker", () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "secret");
    vi.stubEnv(
      "OUTLOOK_REDIRECT_URI",
      "https://www.metricmage.co.uk/api/integrations/outlook/callback",
    );
    const url = new URL(outlookAuthorisationUrl("state", "verifier"));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("scope")).toBe(OUTLOOK_SCOPES.join(" "));
    expect(OUTLOOK_SCOPES).toContain("Mail.ReadBasic");
    expect(OUTLOOK_SCOPES).not.toContain("Mail.Read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("turns received and sent mail into plain events without message content", () => {
    const received = translateOutlook({folder: "inbox", message: message()}, context, mailbox, {});
    expect(received).toMatchObject({
      source: "outlook",
      eventType: "outlook.message_received",
      title: "Email received from Sam Customer",
      description: "Large hutch: delivery date?",
      metadata: {senderEmail: "sam@example.com", unread: true, hasAttachments: true},
    });
    const sent = translateOutlook(
      {
        folder: "sentitems",
        message: message({
          toRecipients: [{emailAddress: {name: "Sam", address: "sam@example.com"}}],
        }),
      },
      context,
      mailbox,
      {},
    );
    expect(sent?.eventType).toBe("outlook.message_sent");
    expect(sent?.occurredAt).toBe("2026-10-03T08:59:00.000Z");
  });

  it("respects the mailbox settings and spots internal mail", () => {
    expect(
      translateOutlook({folder: "inbox", message: message()}, context, mailbox, {
        includeReceived: false,
      }),
    ).toBeNull();
    const colleague = message({from: {emailAddress: {address: "jo@hutchandco.co.uk"}}});
    expect(outlookDirection({folder: "inbox", message: colleague}, mailbox)).toBe("internal");
    expect(outlookDirection({folder: "inbox", message: message()}, mailbox)).toBe("inbound");
  });

  it("only asks for mail newer than the last sync, and remembers the newest", async () => {
    const urls: string[] = [];
    const request = (async (input: URL | RequestInfo) => {
      const url = String(input);
      urls.push(url);
      const sent = url.includes("sentitems");
      return new Response(
        JSON.stringify({
          value: [
            message({id: sent ? "s1" : "r1", receivedDateTime: "2026-10-03T10:00:00Z"}),
            message({
              id: sent ? "s2" : "r2",
              receivedDateTime: "2026-10-03T11:00:00Z",
              sentDateTime: "2026-10-03T11:30:00Z",
            }),
          ],
        }),
      );
    }) as typeof fetch;
    const client = new OutlookClient(
      {accessToken: "t", expiresAt: "2999-01-01T00:00:00Z"},
      request,
    );
    const result = await client.collect({
      initialSyncComplete: true,
      inboxCursor: "2026-10-03T08:00:00Z",
      sentCursor: "2026-10-03T07:00:00Z",
    });
    expect(decodeURIComponent(urls[0])).toContain("receivedDateTime ge 2026-10-03T08:00:00Z");
    expect(decodeURIComponent(urls[1])).toContain("sentDateTime ge 2026-10-03T07:00:00Z");
    expect(result.inboxCursor).toBe("2026-10-03T11:00:00Z");
    expect(result.sentCursor).toBe("2026-10-03T11:30:00Z");
    expect(result.records.map((r) => r.folder)).toEqual([
      "inbox",
      "inbox",
      "sentitems",
      "sentitems",
    ]);
  });

  it("renews an expired sign-in and keeps Microsoft's new refresh token", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "secret");
    const request = (async (input: URL | RequestInfo) =>
      String(input).includes("/token")
        ? new Response(
            JSON.stringify({access_token: "new", refresh_token: "rotated", expires_in: 3600}),
          )
        : new Response(JSON.stringify({id: "u", mail: mailbox}))) as typeof fetch;
    const client = new OutlookClient(
      {accessToken: "old", refreshToken: "first", expiresAt: "2020-01-01T00:00:00Z"},
      request,
    );
    await client.profile();
    expect(client.credentialUpdate()).toMatchObject({accessToken: "new", refreshToken: "rotated"});
  });

  it("explains failures in plain English", async () => {
    const failing = (status: number, code: string) =>
      (async () =>
        new Response(JSON.stringify({error: {code, message: "nope"}}), {status})) as typeof fetch;
    const valid = {accessToken: "t", expiresAt: "2999-01-01T00:00:00Z"};
    await expect(
      new OutlookClient(valid, failing(404, "MailboxNotEnabledForRESTAPI")).profile(),
    ).rejects.toThrow("doesn't have an Outlook mailbox");
    await expect(
      new OutlookClient(valid, failing(401, "InvalidAuthenticationToken")).profile(),
    ).rejects.toMatchObject({kind: "unauthorized"});
    await expect(
      new OutlookClient(valid, failing(500, "generalException")).profile(),
    ).rejects.toThrow("(500: generalException: nope)");
  });

  it("syncs into events and saves its progress", async () => {
    const request = (async (input: URL | RequestInfo) =>
      new Response(
        JSON.stringify(
          String(input).includes("/messages") ? {value: [message()]} : {mail: mailbox},
        ),
      )) as typeof fetch;
    const connector = new OutlookConnector(
      new OutlookClient({accessToken: "t", expiresAt: "2999-01-01T00:00:00Z"}, request),
      {mailboxEmail: mailbox, includeSent: false},
    );
    const result = await connector.sync({organisationId: "o", integrationId: "i"});
    expect(result.events).toHaveLength(1);
    expect(result.settings).toMatchObject({
      initialSyncComplete: true,
      inboxCursor: "2026-10-03T09:00:00Z",
    });
  });
});
