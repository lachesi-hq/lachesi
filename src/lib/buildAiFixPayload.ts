import { jiraBrowseUrl } from "@/lib/jira";
import type { AiReviewThread, BranchStatus, PullRequestDetail } from "@/types";

export interface AiFixPayloadInput {
  pr: PullRequestDetail;
  thread: AiReviewThread;
  branchStatus?: BranchStatus | null;
  rawDiff: string;
  jiraKeys?: string[];
  jiraBaseUrl?: string | null;
  jiraContext?: string | null;
}

function buildConversationTranscript(thread: AiReviewThread): string {
  return thread.messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Assistant" : "Reviewer";
      return `### ${speaker}\n${message.content.trim()}`;
    })
    .join("\n\n");
}

/** Build the prompt Claude uses to fix actionable findings from the saved AI review. */
export function buildAiFixPayload({
  pr,
  thread,
  branchStatus,
  rawDiff,
  jiraKeys,
  jiraBaseUrl,
  jiraContext,
}: AiFixPayloadInput): string {
  const lines = [
    "You are a senior software engineer fixing actionable findings from an AI pull request review.",
    "Work in the current git branch and make the minimum code changes needed to address valid issues.",
    "You may inspect and edit files, and run local checks if useful.",
    "Do not create commits, do not push, and do not change git history.",
    "Use the full review conversation as context, not only the first review message.",
    "If later assistant messages refine or contradict earlier ones, treat the latest assistant position as authoritative.",
    "If a finding is incorrect or not actionable, leave the code unchanged for that item and explain it briefly in the summary.",
    'Return ONLY JSON matching this shape: {"status":"success|failed","summary":"string","commitMessage":"string","tests":["..."],"filesTouched":["..."],"failureReason":"string?"}.',
    "",
    "## Pull request",
    `${pr.title} (#${pr.id})`,
    `Branch: ${pr.sourceBranch} -> ${pr.destinationBranch}`,
  ];

  if (branchStatus && (branchStatus.behind > 0 || branchStatus.ahead > 0)) {
    const behind = `${branchStatus.behind}${branchStatus.behindCapped ? "+" : ""}`;
    const ahead = `${branchStatus.ahead}${branchStatus.aheadCapped ? "+" : ""}`;
    lines.push(`Commits: ${ahead} ahead, ${behind} behind ${pr.destinationBranch}`);
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
    }
  }

  lines.push("", "## Review conversation", buildConversationTranscript(thread));
  lines.push("", "## Diff", "```diff", rawDiff.trim(), "```");
  return lines.join("\n");
}
