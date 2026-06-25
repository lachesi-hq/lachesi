import { jiraBrowseUrl } from "@/lib/jira";
import type { ReviewReference } from "@/types";

export interface FormatReviewReferencesInput {
  detectedJiraKeys?: string[];
  jiraBaseUrl?: string | null;
  manualReferences?: ReviewReference[];
}

function referenceLabel(reference: ReviewReference): string {
  switch (reference.type) {
    case "pullRequest":
      return "Pull request";
    case "repository":
      return "Repository";
    case "jira":
      return "Jira";
    case "notion":
      return "Notion";
    case "note":
      return "Reviewer note";
  }
}

function pushField(lines: string[], label: string, value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) lines.push(`  ${label}: ${trimmed}`);
}

function appendReferenceFields(lines: string[], reference: ReviewReference): void {
  if (reference.type === "note") {
    pushField(lines, "Body", reference.body);
    return;
  }

  if (reference.type === "jira") {
    pushField(lines, "Key", reference.key);
    pushField(lines, "URL", reference.url);
    return;
  }

  if (reference.type === "repository") {
    const repo = [reference.workspace, reference.repo].filter(Boolean).join("/");
    pushField(lines, "Repository", repo || reference.repo);
    pushField(lines, "Local path", reference.localPath);
    pushField(lines, "URL", reference.url);
    lines.push(
      "  Instruction: Treat this repository as read-only architectural context. If a local path is available, inspect relevant files before making repository-wide claims.",
    );
    return;
  }

  if (reference.type === "pullRequest") {
    const repo = [reference.workspace, reference.repo].filter(Boolean).join("/");
    pushField(lines, "Repository", repo);
    pushField(lines, "Pull request", reference.prId != null ? `#${reference.prId}` : null);
    pushField(lines, "URL", reference.url);
    lines.push(
      "  Instruction: Treat this as related PR context. Compare contracts, sequencing, and compatibility with the PR under review.",
    );
    return;
  }

  pushField(lines, "URL", reference.url);
}

export function formatReviewReferences({
  detectedJiraKeys = [],
  jiraBaseUrl,
  manualReferences = [],
}: FormatReviewReferencesInput): string | null {
  const lines: string[] = [];
  if (detectedJiraKeys.length > 0) {
    lines.push("### Detected references");
    for (const key of detectedJiraKeys) {
      lines.push(
        jiraBaseUrl ? `- Jira ${key}: ${jiraBrowseUrl(jiraBaseUrl, key)}` : `- Jira ${key}`,
      );
    }
  }

  if (manualReferences.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("### Manual references from reviewer");
    for (const reference of manualReferences) {
      const title = reference.title?.trim();
      const label =
        reference.type === "repository" &&
        title === [reference.workspace, reference.repo].filter(Boolean).join("/")
          ? referenceLabel(reference)
          : title
            ? `${referenceLabel(reference)}: ${title}`
            : referenceLabel(reference);
      lines.push(`- ${label}`);
      appendReferenceFields(lines, reference);
      if (title && reference.type === "note" && reference.body?.trim()) {
        lines.push(`  Title: ${title}`);
      }
      if (reference.body?.trim() && reference.type !== "note") {
        lines.push(`  Guidance: ${reference.body.trim()}`);
      }
    }
    lines.push(
      "",
      "Use the manual references as explicit reviewer-provided context. If a URL or identifier cannot be fetched from your available tools, state that limitation in the review instead of ignoring the reference.",
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
