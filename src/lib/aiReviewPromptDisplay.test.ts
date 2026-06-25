import { describe, expect, it } from "vitest";
import {
  buildReviewPromptDisplayMessage,
  parseReviewPromptDisplayMessage,
} from "@/lib/aiReviewPromptDisplay";

describe("aiReviewPromptDisplay", () => {
  it("round-trips the visible review request and full prompt", () => {
    const message = buildReviewPromptDisplayMessage("Full payload\nwith diff");

    expect(parseReviewPromptDisplayMessage(message)).toEqual({
      intro: "Run the standard AI review for this pull request.",
      prompt: "Full payload\nwith diff",
    });
  });

  it("ignores normal reviewer messages", () => {
    expect(parseReviewPromptDisplayMessage("Can you explain this finding?")).toBeNull();
  });
});
