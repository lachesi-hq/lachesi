import { buildReviewPayload } from "@/lib/buildReviewPayload";
import { extractIssueKeys } from "@/lib/jira";
import { resolveReviewPrompt } from "@/lib/reviewPrompt";
import { loadReviewReferences } from "@/lib/reviewReferencesStorage";
import { tauriCall } from "@/lib/tauri";
import type { BranchStatus, JiraIssue, NotionPage, PullRequestDetail, RepoRef } from "@/types";

export interface AiReviewPayloadForPr {
  payload: string;
  pr: PullRequestDetail;
  branchStatus: BranchStatus | null;
  jiraKeys: string[];
  rawDiff: string;
}

async function fetchReviewContext(jiraKeys: string[], enabled: boolean): Promise<string | null> {
  if (!enabled || jiraKeys.length === 0) return null;
  const parts: string[] = [];
  for (const key of jiraKeys) {
    try {
      const issue = await tauriCall<JiraIssue>("get_jira_issue", { key });
      parts.push(`### ${issue.key} — ${issue.summary}${issue.status ? ` (${issue.status})` : ""}`);
      if (issue.descriptionText) parts.push(issue.descriptionText);
      for (const url of issue.notionUrls) {
        try {
          const page = await tauriCall<NotionPage>("get_notion_page", { url });
          parts.push(`#### Notion: ${page.title || url}`);
          if (page.text) parts.push(page.text);
        } catch {
          // Skip pages the user has not configured or cannot access.
        }
      }
    } catch {
      // Skip Jira issues the user has not configured or cannot access.
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export async function buildAiReviewPayloadForPr({
  workspace,
  repo,
  prId,
  repoConfig,
  jiraBaseUrl,
  jiraContextEnabled,
}: {
  workspace: string;
  repo: string;
  prId: number;
  repoConfig?: RepoRef | null;
  jiraBaseUrl: string | null;
  jiraContextEnabled: boolean;
}): Promise<AiReviewPayloadForPr> {
  const pr = await tauriCall<PullRequestDetail>("get_pull_request", {
    workspace,
    repo,
    id: prId,
  });
  const [rawDiff, branchStatus] = await Promise.all([
    tauriCall<string>("get_pr_diff", { workspace, repo, id: prId }),
    tauriCall<BranchStatus>("get_branch_status", {
      workspace,
      repo,
      source: pr.sourceBranch,
      destination: pr.destinationBranch,
    }).catch(() => null),
  ]);
  const jiraKeys = extractIssueKeys(pr.sourceBranch, pr.title);
  const jiraContext = await fetchReviewContext(jiraKeys, jiraContextEnabled);
  const { prompt, warnings } = await resolveReviewPrompt(
    `${workspace}/${repo}`,
    repoConfig?.localPath,
  );
  if (warnings.length > 0) {
    console.warn("Lachesi repo config warnings:", warnings);
  }
  const payload = buildReviewPayload({
    prompt,
    pr,
    branchStatus,
    rawDiff,
    jiraKeys,
    jiraBaseUrl,
    jiraContext,
    reviewReferences: loadReviewReferences(workspace, repo, prId),
  });
  return { payload, pr, branchStatus, jiraKeys, rawDiff };
}
