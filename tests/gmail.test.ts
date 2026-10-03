import {describe, expect, it, vi} from "vitest";
import {providerRegistry} from "@/lib/integrations/registry";
import {direction, translateGmail} from "@/lib/integrations/gmail/translator";
import {challenge, gmailAuthorisationUrl, stateMatches} from "@/lib/integrations/gmail/oauth";
import {GmailClient} from "@/lib/integrations/gmail/client";
const ctx = {organisationId: "org", integrationId: "mailbox", receivedAt: "2026-07-28T00:00:00Z"};
const msg = (labels = ["INBOX", "UNREAD"]) => ({
  id: "m1",
  threadId: "t1",
  internalDate: "1753657200000",
  labelIds: labels,
  snippet: "private body",
  payload: {
    headers: [
      {name: "From", value: "Alex <alex@example.com>"},
      {name: "To", value: "Tash <tash@workspace.com>"},
      {name: "Subject", value: "<script>alert(1)</script> Approval"},
    ],
    parts: [{filename: "brief.pdf", body: {attachmentId: "a"}}],
  },
});
describe("Gmail integration", () => {
  it("is registered as a real read-only connector", () =>
    expect(providerRegistry.gmail).toMatchObject({
      connector: "gmail",
      category: "Communication",
      capabilities: expect.arrayContaining(["oauth", "polling", "read_only"]),
    }));
  it("generates PKCE OAuth with only Gmail read-only", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost/callback";
    const url = new URL(gmailAuthorisationUrl("state", "verifier"));
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("scope")).not.toMatch(/gmail\\.(send|modify|compose)/);
    expect(url.searchParams.get("code_challenge")).toBe(challenge("verifier"));
  });
  it("validates OAuth state", () => {
    expect(stateMatches("a", "a")).toBe(true);
    expect(stateMatches("a", "b")).toBe(false);
  });
  it("detects inbound outbound internal and unknown directions", () => {
    expect(direction("a@else.com", ["box@work.com"], "box@work.com")).toBe("inbound");
    expect(direction("box@work.com", ["a@else.com"], "box@work.com")).toBe("outbound");
    expect(direction("a@work.com", ["box@work.com"], "box@work.com")).toBe("internal");
    expect(direction("a@else.com", ["b@else.com"], "box@work.com")).toBe("unknown");
  });
  it("translates privacy-limited metadata and escapes provider strings", () => {
    const event = translateGmail(msg(), ctx, "tash@workspace.com", {
      includeAttachments: true,
      includeUnread: true,
    });
    expect(event?.eventType).toBe("gmail.message_received");
    expect(event?.title).not.toContain("<");
    expect(event?.metadata).toMatchObject({direction: "inbound", unread: true, attachmentCount: 1});
    expect(JSON.stringify(event)).not.toContain("private body");
  });
  it("excludes spam and trash", () =>
    expect(translateGmail(msg(["SPAM"]), ctx, "tash@workspace.com", {})).toBeNull());
  it("uses integration-specific duplicate IDs", () => {
    const a = translateGmail(msg(), ctx, "tash@workspace.com", {}),
      b = translateGmail(msg(), {...ctx, integrationId: "other"}, "tash@workspace.com", {});
    expect(a?.externalId).not.toBe(b?.externalId);
  });
  it("refreshes expired tokens without exposing them", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({access_token: "new", expires_in: 3600}), {status: 200}),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: "x@y.com",
            historyId: "1",
            messagesTotal: 1,
            threadsTotal: 1,
          }),
          {status: 200},
        ),
      );
    const client = new GmailClient(
      {accessToken: "old", refreshToken: "refresh", expiresAt: "2020-01-01"},
      request,
    );
    await client.profile();
    expect(client.credentialUpdate()?.accessToken).toBe("new");
  });
});

describe("Gmail connection errors", () => {
  const failing = (status: number, error: object) =>
    (async () => new Response(JSON.stringify({error}), {status})) as typeof fetch;
  const valid = {accessToken: "t", expiresAt: "2999-01-01T00:00:00Z"};

  it("explains when the Google account has no Gmail inbox", async () => {
    const client = new GmailClient(
      valid,
      failing(400, {status: "FAILED_PRECONDITION", message: "Mail service not enabled"}),
    );
    await expect(client.profile()).rejects.toThrow("doesn't have a Gmail inbox");
  });

  it("passes on Google's reason instead of a generic failure", async () => {
    const client = new GmailClient(
      valid,
      failing(400, {status: "INVALID_ARGUMENT", message: "Bad request"}),
    );
    await expect(client.profile()).rejects.toThrow("(400: INVALID_ARGUMENT Bad request)");
  });
});
