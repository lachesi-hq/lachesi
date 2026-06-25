import { describe, expect, it } from "vitest";
import { buildAiFixPayload } from "@/lib/buildAiFixPayload";

describe("buildAiFixPayload", () => {
  it("includes the review conversation, PR metadata, and JSON contract instructions", () => {
    const payload = buildAiFixPayload({
      pr: {
        id: 1731,
        title: "CB-2066 - fix category drill-down returning empty orders",
        descriptionRaw: "Use the ERP category code in the generated orders URL.",
        state: "OPEN",
        draft: false,
        authorDisplayName: "Alex Reviewer",
        reviewers: [],
        sourceBranch: "CB-2066-category-drilldown",
        destinationBranch: "develop",
        createdOn: "2026-06-16T09:00:00.000Z",
        updatedOn: "2026-06-16T15:40:00.000Z",
      },
      thread: {
        id: "thread-1",
        title: "Review",
        createdAt: "1750076400000",
        updatedAt: "1750076400000",
        claudeSessionId: "session-1",
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "## AI Review\n\n- Missing regression test for the new query parameter.",
            createdAt: "1750076400000",
          },
          {
            id: "user-1",
            role: "user",
            content: "I think the old tests already cover that path. Please re-check.",
            createdAt: "1750077400000",
          },
        ],
      },
      branchStatus: { behind: 1, ahead: 2, behindCapped: false, aheadCapped: false },
      rawDiff: "diff --git a/file.ts b/file.ts",
      jiraKeys: ["CB-2066"],
      jiraBaseUrl: "https://example.atlassian.net",
      jiraContext: "Ticket says the ERP category code is the source of truth.",
    });

    expect(payload).toContain("Return ONLY JSON matching this shape");
    expect(payload).toContain("## Review conversation");
    expect(payload).toContain("### Assistant");
    expect(payload).toContain("### Reviewer");
    expect(payload).toContain("## Pull request");
    expect(payload).toContain("CB-2066: https://example.atlassian.net/browse/CB-2066");
    expect(payload).toContain("```diff");
  });
});
