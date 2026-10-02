import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("@/lib/jobs/dispatch", () => ({dispatchDueJobs: vi.fn(async () => ({dispatched: 0}))}));

import {POST as dispatch} from "@/app/api/jobs/dispatch/route";
import {insightDatabaseError, isInsightId} from "@/lib/intelligence/api-context";

describe("job dispatch authorisation", () => {
  beforeEach(() => {
    process.env.BACKGROUND_JOB_SECRET = "job-secret-value";
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    delete process.env.BACKGROUND_JOB_SECRET;
  });

  it("accepts the secret as a bearer header", async () => {
    const response = await dispatch(
      new Request("https://ghost.test/api/jobs/dispatch", {
        method: "POST",
        headers: {authorization: "Bearer job-secret-value"},
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects the secret in the query string so it never lands in access logs", async () => {
    const response = await dispatch(
      new Request("https://ghost.test/api/jobs/dispatch?secret=job-secret-value", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("insight API errors", () => {
  it("only treats UUIDs as insight IDs", () => {
    expect(isInsightId("1b4e28ba-2fa1-41d2-883f-0016d3cca427")).toBe(true);
    expect(isInsightId("not-a-uuid")).toBe(false);
    expect(isInsightId("1' or '1'='1")).toBe(false);
  });

  it("never returns raw database error text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = insightDatabaseError("query_failed", {
      message: "column insights.secret_column does not exist",
    });
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.code).toBe("query_failed");
    expect(JSON.stringify(body)).not.toContain("secret_column");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
