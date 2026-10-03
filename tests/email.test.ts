import {describe, expect, it, vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {EmailError, emailConfig, sendEmail} from "@/lib/email/resend";
import {approvalEmail, notificationEmail} from "@/lib/email/templates";
import {approvalRecipients, notificationRecipients} from "@/lib/email/recipients";
import {
  EMAIL_MAX_ATTEMPTS,
  deliverEmails,
  retryDelayMs,
  runEmailDelivery,
} from "@/lib/email/outbox";
import {maintenanceJobs} from "@/lib/jobs/registry";
import type {Preference} from "@/lib/notifications/preferences";

const config = {
  apiKey: "re_secret_key",
  from: "Metric Mage <alerts@mail.test>",
  appUrl: "https://app.test",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
const pref = (overrides: Partial<Preference>): Preference => ({
  user_id: null,
  category: null,
  minimum_severity: "info",
  in_app_enabled: true,
  email_enabled: false,
  webhook_enabled: false,
  assignment_enabled: true,
  digest_mode: "immediate",
  ...overrides,
});

describe("email configuration", () => {
  it("stays disabled until both the API key and sender are set", () => {
    expect(emailConfig({RESEND_API_KEY: "re_x"})).toBeNull();
    expect(emailConfig({EMAIL_FROM: "a@b.test"})).toBeNull();
    expect(
      emailConfig({
        RESEND_API_KEY: "re_x",
        EMAIL_FROM: "a@b.test",
        NEXT_PUBLIC_SITE_URL: "https://app.test/",
      }),
    ).toEqual({apiKey: "re_x", from: "a@b.test", appUrl: "https://app.test"});
  });

  it("is registered as a five-minute background job", () =>
    expect(maintenanceJobs).toContainEqual(
      expect.objectContaining({key: "email.deliver", scheduleValue: "5m"}),
    ));
});

describe("Resend client", () => {
  const message = {
    to: "ada@example.test",
    subject: "Hi",
    html: "<p>Hi</p>",
    text: "Hi",
    idempotencyKey: "notification:n1:u1",
  };

  it("authenticates with a header and sends an idempotency key", async () => {
    const request = vi.fn<typeof fetch>(async () => json({id: "email_1"}));
    await expect(sendEmail(config, message, request as typeof fetch)).resolves.toEqual({
      id: "email_1",
    });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(String(url)).not.toContain("re_secret_key");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer re_secret_key",
      "Idempotency-Key": "notification:n1:u1",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({to: ["ada@example.test"]});
  });

  it("retries rate limits and outages but not rejections", async () => {
    const attempt = (response: Response) =>
      sendEmail(config, message, (async () => response) as typeof fetch).catch((e) => e);
    expect(await attempt(json({message: "slow down"}, 429))).toMatchObject({retryable: true});
    expect(await attempt(json({}, 503))).toMatchObject({retryable: true});
    const rejected = await attempt(json({message: "Invalid `to` field"}, 422));
    expect(rejected).toBeInstanceOf(EmailError);
    expect(rejected).toMatchObject({retryable: false});
    expect(rejected.message).toContain("Invalid `to` field");
  });

  it("treats network failures as retryable without leaking details", async () => {
    const error = await sendEmail(config, message, (async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com re_secret_key");
    }) as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({retryable: true});
    expect(error.message).not.toContain("re_secret_key");
  });
});

describe("email templates", () => {
  const notification = {
    id: "n1",
    title: 'Sync failed <script>alert("x")</script>',
    summary: "Shopify & Stripe stopped syncing.",
    recommended_action: "Reconnect Shopify.",
    severity: "critical",
  };

  it("escapes provider text in HTML and links to the alert", () => {
    const email = notificationEmail({
      appUrl: "https://app.test",
      organisationName: "Acme",
      notification,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Shopify &amp; Stripe");
    expect(email.html).toContain("https://app.test/app/action-centre/n1");
    expect(email.text).toContain("https://app.test/app/action-centre/n1");
    expect(email.subject.startsWith("[Critical]")).toBe(true);
  });

  it("keeps subjects on one line", () => {
    const email = notificationEmail({
      appUrl: "https://app.test",
      organisationName: "Acme",
      notification: {...notification, title: "Line one\r\nBcc: attacker@example.test"},
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("links approvals to the approval page", () => {
    const email = approvalEmail({
      appUrl: "https://app.test",
      organisationName: "Acme",
      workflowName: "Refund review",
      approval: {id: "a1", due_at: null},
    });
    expect(email.subject).toBe("Approval needed: Refund review · Acme");
    expect(email.html).toContain("https://app.test/app/approvals/a1");
  });
});

describe("email recipients", () => {
  const members = [
    {user_id: "owner", role: "owner"},
    {user_id: "manager", role: "manager"},
    {user_id: "viewer", role: "viewer"},
  ];

  it("only emails alerts to people who opted in", () => {
    const prefs = [pref({user_id: "manager", email_enabled: true})];
    expect(
      notificationRecipients(members, prefs, {category: "integration", severity: "info"}),
    ).toEqual(["manager"]);
  });

  it("respects minimum severity and digest mode", () => {
    const prefs = [
      pref({user_id: "owner", email_enabled: true, minimum_severity: "critical"}),
      pref({user_id: "manager", email_enabled: true, digest_mode: "daily"}),
    ];
    expect(
      notificationRecipients(members, prefs, {category: "integration", severity: "warning"}),
    ).toEqual([]);
    expect(
      notificationRecipients(members, prefs, {category: "integration", severity: "critical"}),
    ).toEqual(["owner"]);
  });

  it("applies organisation-wide email preferences", () => {
    const prefs = [pref({email_enabled: true, minimum_severity: "warning"})];
    expect(
      notificationRecipients(members, prefs, {category: "security", severity: "critical"}),
    ).toEqual(["owner", "manager", "viewer"]);
  });

  it("emails approvals to the named approver or role by default", () => {
    expect(
      approvalRecipients(members, [], {approver_user_id: "owner", approver_role: null}),
    ).toEqual(["owner"]);
    expect(
      approvalRecipients(members, [], {approver_user_id: null, approver_role: "manager"}),
    ).toEqual(["manager"]);
    expect(approvalRecipients(members, [], {approver_user_id: null, approver_role: null})).toEqual(
      [],
    );
  });

  it("lets approvers opt out with the assignment preference", () => {
    const prefs = [pref({user_id: "owner", assignment_enabled: false})];
    expect(
      approvalRecipients(members, prefs, {approver_user_id: "owner", approver_role: null}),
    ).toEqual([]);
  });
});

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeClient(pending: Record<string, unknown>[]) {
  const updates: {id: unknown; values: Record<string, unknown>}[] = [];
  const builder = (result: unknown, onEq?: (value: unknown) => void) => {
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    for (const method of ["select", "lte", "order", "limit", "in", "lt", "delete"])
      chain[method] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      if (column === "id") onEq?.(value);
      return chain;
    };
    return chain;
  };
  const client = {
    from: () => ({
      select: () => builder({data: pending}),
      update: (values: Record<string, unknown>) =>
        builder({error: null}, (id) => updates.push({id, values})),
      delete: () => builder({error: null}),
    }),
  };
  return {client: client as unknown as SupabaseClient<Database>, updates};
}

const outboxRow = (id: string, attempts = 0) => ({
  id,
  recipient_email: `${id}@example.test`,
  subject: "Subject",
  html_body: "<p>Body</p>",
  text_body: "Body",
  dedupe_key: `notification:${id}:u`,
  attempts,
});

describe("email delivery", () => {
  it("marks sent, retries temporary failures, and gives up on rejections", async () => {
    const {client, updates} = fakeClient([outboxRow("ok"), outboxRow("busy"), outboxRow("bad")]);
    const request = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const to = JSON.parse(String(init?.body)).to[0];
      if (to.startsWith("ok")) return json({id: "email_ok"});
      if (to.startsWith("busy")) return json({}, 429);
      return json({message: "Invalid from address"}, 422);
    }) as typeof fetch;
    await expect(deliverEmails(client, "org", config, request)).resolves.toEqual({
      due: 3,
      sent: 1,
      retrying: 1,
      failed: 1,
    });
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.values]));
    expect(byId.ok).toMatchObject({status: "sent", provider_message_id: "email_ok", attempts: 1});
    expect(byId.busy).toMatchObject({status: "pending", attempts: 1});
    expect(byId.bad).toMatchObject({status: "failed", attempts: 1});
  });

  it("stops retrying after the maximum number of attempts", async () => {
    const {client, updates} = fakeClient([outboxRow("busy", EMAIL_MAX_ATTEMPTS - 1)]);
    await deliverEmails(client, "org", config, (async () => json({}, 503)) as typeof fetch);
    expect(updates[0].values).toMatchObject({status: "failed", attempts: EMAIL_MAX_ATTEMPTS});
  });

  it("backs off exponentially up to one hour", () => {
    expect(retryDelayMs(1)).toBe(120_000);
    expect(retryDelayMs(2)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });

  it("does nothing until email is configured", async () => {
    const client = {
      from: () => {
        throw new Error("database should not be touched");
      },
    } as unknown as SupabaseClient<Database>;
    await expect(runEmailDelivery(client, "org", {})).resolves.toMatchObject({
      processed: 0,
      metadata: {configured: false},
    });
  });
});
