import {describe, expect, it} from "vitest";
import {buildFailurePayload} from "@/lib/workflows/triggers";
import {getWorkflowTemplate} from "@/lib/workflows/templates";
import {triggerLabel} from "@/lib/ui/labels";

describe("build or deploy failure trigger", () => {
  it("passes on the details of a failed GitHub run", () => {
    expect(
      buildFailurePayload({
        source: "github",
        event_type: "workflow.failed",
        title: "CI failed",
        metadata: {conclusion: "failure", repository: "a/shop", branch: "main", url: "https://x"},
      }),
    ).toEqual({
      source: "github",
      eventType: "workflow.failed",
      title: "CI failed",
      repository: "a/shop",
      branch: "main",
      url: "https://x",
    });
  });

  it("uses the Vercel project name", () => {
    expect(
      buildFailurePayload({
        source: "vercel",
        event_type: "vercel.deployment.failed",
        title: "Deploy failed",
        metadata: {project: "unhinged-clothing"},
      })?.repository,
    ).toBe("unhinged-clothing");
  });

  it("ignores cancelled runs", () => {
    expect(
      buildFailurePayload({
        source: "github",
        event_type: "workflow.failed",
        title: "CI failed",
        metadata: {conclusion: "cancelled"},
      }),
    ).toBeNull();
  });

  it("is what the Deployment failure review template listens for", () => {
    const template = getWorkflowTemplate("deployment_failure");
    expect(template?.definition.triggerType).toBe("deployment.failed");
    expect(triggerLabel("deployment.failed")).toBe("When a build or deploy fails");
  });
});
