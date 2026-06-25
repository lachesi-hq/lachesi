import { jiraBrowseUrl } from "@/lib/jira";
import { formatReviewReferences } from "@/lib/reviewReferences";
import type { BranchStatus, PullRequestDetail, ReviewReference } from "@/types";

export interface ReviewPayloadInput {
  prompt: string;
  pr: PullRequestDetail;
  branchStatus?: BranchStatus | null;
  rawDiff: string;
  /** Jira issue keys extracted from the branch/title. */
  jiraKeys?: string[];
  /** Jira site base URL, for building browse links. */
  jiraBaseUrl?: string | null;
  /** Pre-fetched Jira ticket + linked Notion docs text (in-app fetch). */
  jiraContext?: string | null;
  /** User-provided and detected references that should guide the review. */
  reviewReferences?: ReviewReference[];
}

/** Assemble the prompt + PR context + related Jira/Notion + diff into one paste-ready blob. */
export function buildReviewPayload({
  prompt,
  pr,
  branchStatus,
  rawDiff,
  jiraKeys,
  jiraBaseUrl,
  jiraContext,
  reviewReferences,
}: ReviewPayloadInput): string {
  const lines: string[] = [prompt.trim(), "", "## Pull request", `${pr.title} (#${pr.id})`];
  lines.push(`Branch: ${pr.sourceBranch} → ${pr.destinationBranch}`);
  if (branchStatus && (branchStatus.behind > 0 || branchStatus.ahead > 0)) {
    const b = `${branchStatus.behind}${branchStatus.behindCapped ? "+" : ""}`;
    const a = `${branchStatus.ahead}${branchStatus.aheadCapped ? "+" : ""}`;
    lines.push(`Commits: ${a} ahead, ${b} behind ${pr.destinationBranch}`);
  }
  if (pr.descriptionRaw.trim()) {
    lines.push("", "## Description", pr.descriptionRaw.trim());
  }

  if (jiraKeys && jiraKeys.length > 0) {
    lines.push("", "## Related Jira");
    for (const key of jiraKeys) {
      lines.push(jiraBaseUrl ? `- ${key}: ${jiraBrowseUrl(jiraBaseUrl, key)}` : `- ${key}`);
    }
    if (jiraContext?.trim()) {
      lines.push("", jiraContext.trim());
    } else {
      lines.push(
        "",
        "Before reviewing, fetch the Jira ticket(s) above and follow any Notion/Confluence links inside them. Treat the ticket + linked docs as the intended behavior, and flag anything in the diff that conflicts with or fails to fulfil it.",
      );
    }
  }

  const references = formatReviewReferences({
    detectedJiraKeys: jiraKeys,
    jiraBaseUrl,
    manualReferences: reviewReferences,
  });
  if (references) {
    lines.push("", "## References", references);
  }

  lines.push("", "## Diff", "```diff", rawDiff.trim(), "```");
  return lines.join("\n");
}
