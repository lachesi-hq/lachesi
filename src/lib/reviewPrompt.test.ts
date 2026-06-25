import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_PROMPT } from "@/lib/reviewPrompt";

describe("DEFAULT_REVIEW_PROMPT", () => {
  it("guides Claude to inspect local references and handle documentation diffs", () => {
    expect(DEFAULT_REVIEW_PROMPT).toContain("inspect any manual reference with a local path");
    expect(DEFAULT_REVIEW_PROMPT).toContain("documentation or conventions only");
    expect(DEFAULT_REVIEW_PROMPT).toContain("Do not invent runtime bugs");
  });

  it("requires a stable machine-readable findings schema", () => {
    expect(DEFAULT_REVIEW_PROMPT).toContain('"schemaVersion": "lachesi.review.v1"');
    expect(DEFAULT_REVIEW_PROMPT).toContain('"severity": "critical|major|minor|nit"');
    expect(DEFAULT_REVIEW_PROMPT).toContain('"confidence": "low|medium|high"');
    expect(DEFAULT_REVIEW_PROMPT).toContain("Use an empty `findings` array");
  });
});
