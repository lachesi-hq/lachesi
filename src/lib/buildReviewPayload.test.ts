import { describe, expect, it } from "vitest";
import { mockPullRequestDetail } from "@/mock-tauri/fixtures";
import { sampleRawDiff } from "@/storybook/bitbucket.fixtures";
import { buildReviewPayload } from "./buildReviewPayload";

describe("buildReviewPayload", () => {
  it("includes the prompt, PR title, branch status, and a fenced diff", () => {
    const out = buildReviewPayload({
      prompt: "REVIEW THIS",
      pr: mockPullRequestDetail,
      branchStatus: { behind: 2, ahead: 1, behindCapped: false, aheadCapped: false },
      rawDiff: sampleRawDiff,
    });
    expect(out.startsWith("REVIEW THIS")).toBe(true);
    expect(out).toContain(`${mockPullRequestDetail.title} (#${mockPullRequestDetail.id})`);
    expect(out).toContain("2 behind");
    expect(out).toContain(mockPullRequestDetail.destinationBranch);
    expect(out).toContain("```diff");
  });

  it("omits the commit line when there is no branch status", () => {
    const out = buildReviewPayload({
      prompt: "p",
      pr: mockPullRequestDetail,
      branchStatus: null,
      rawDiff: "x",
    });
    expect(out).not.toContain("behind");
  });

  it("includes detected and manual review references", () => {
    const out = buildReviewPayload({
      prompt: "p",
      pr: mockPullRequestDetail,
      branchStatus: null,
      rawDiff: "x",
      jiraKeys: ["CB-1234"],
      jiraBaseUrl: "https://example.atlassian.net",
      reviewReferences: [
        {
          id: "ref-1",
          type: "pullRequest",
          source: "manual",
          title: "Related backend PR",
          url: "https://bitbucket.org/workspace/repo/pull-requests/12",
          body: "Check API compatibility.",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(out).toContain("## References");
    expect(out).toContain("### Detected references");
    expect(out).toContain("CB-1234");
    expect(out).toContain("### Manual references from reviewer");
    expect(out).toContain("Related backend PR");
    expect(out).toContain("Check API compatibility.");
  });

  it("serializes repository references as inspectable architectural context", () => {
    const out = buildReviewPayload({
      prompt: "p",
      pr: mockPullRequestDetail,
      branchStatus: null,
      rawDiff: "x",
      reviewReferences: [
        {
          id: "ref-1",
          type: "repository",
          source: "manual",
          workspace: "example-workspace",
          repo: "backend-api",
          localPath: "/Users/alex/dev/example/backend-api",
          body: "Check DTO and endpoint conventions before commenting on API shape.",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(out).toContain("Repository: example-workspace/backend-api");
    expect(out).toContain("Local path: /Users/alex/dev/example/backend-api");
    expect(out).toContain("Treat this repository as read-only architectural context");
    expect(out).toContain("Check DTO and endpoint conventions");
    expect(out).not.toContain("- Repository: example-workspace/backend-api");
  });
});
