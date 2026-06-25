import { describe, expect, it } from "vitest";
import { extractIssueKeys, jiraBrowseUrl } from "./jira";

describe("extractIssueKeys", () => {
  it("extracts the key from branch + title", () => {
    expect(
      extractIssueKeys("CB-2066-category-drilldown", "CB-2066 - fix category drill-down"),
    ).toEqual(["CB-2066"]);
  });

  it("returns [] when there's no key (lowercase / no dash)", () => {
    expect(
      extractIssueKeys("feat/iatf-16949", "[Draft] feat(compliance): add IATF 16949 column"),
    ).toEqual([]);
  });

  it("dedups and preserves first-seen order across sources", () => {
    expect(extractIssueKeys("CB-1 and CB-2", "CB-2 again", null)).toEqual(["CB-1", "CB-2"]);
  });
});

describe("jiraBrowseUrl", () => {
  it("builds a browse url and trims a trailing slash", () => {
    expect(jiraBrowseUrl("https://example.atlassian.net/", "CB-2037")).toBe(
      "https://example.atlassian.net/browse/CB-2037",
    );
  });
});
