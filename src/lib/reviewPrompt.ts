/** Built-in review prompt, used when a repo has no custom prompt. */
import { tauriCall } from "@/lib/tauri";
import type { RepoReviewConfigLoadResult } from "@/types";

export const DEFAULT_REVIEW_PROMPT = `You are a senior software engineer doing a thorough pull request review.

Review the diff below. For each issue found, output:
**[SEVERITY]** \`file:line\` — what the problem is and why it matters.
Fix: concrete suggestion.

Severity levels: Critical (breaks functionality/security) | Major (likely bug or architectural risk) | Minor (edge case, unclear logic) | Nit (low-priority improvement).

Flag: bugs, edge cases, security and performance issues, unclear or risky patterns.
Skip: formatting and style issues handled by linting.
Be concise. If nothing is wrong at a severity level, omit it.

Before reviewing, inspect any manual reference with a local path when it is relevant.
Use referenced repositories as read-only context for architecture, conventions, existing patterns, and API contracts.
Do not make repository-wide claims unless you inspected the relevant reference files. If you cannot inspect them, say so.

If the diff is documentation or conventions only, review it for:
- contradictions with existing repository conventions;
- ambiguous or unenforceable rules;
- outdated paths, tools, libraries, or examples;
- guidance that would lead agents or developers to make worse code changes.
Do not invent runtime bugs for documentation-only diffs.

After the human-readable review, include a machine-readable findings block:

\`\`\`json
{
  "schemaVersion": "lachesi.review.v1",
  "findings": [
    {
      "title": "Short finding title",
      "body": "What the problem is and why it matters.",
      "severity": "critical|major|minor|nit",
      "category": "bug|security|performance|architecture|typing|test|maintainability|docs|other",
      "confidence": "low|medium|high",
      "file": "path/to/file.ts",
      "line": 123,
      "endLine": 125,
      "suggestedFix": "Concrete suggestion."
    }
  ]
}
\`\`\`

Use an empty \`findings\` array when there are no issues. Omit \`file\`, \`line\`, and \`endLine\` only when the finding cannot be anchored to a changed line.

After your review, add a "## Resources" section with 3–5 links to official,
stable documentation pages (MDN, React docs, etc.) that deepen understanding
of non-obvious patterns in this diff. Only include links you are confident
exist. Omit this section if the diff is purely documentation or conventions.
Format: - [Title](URL) — one-sentence description.`;

function key(repoKey: string): string {
  return `lachesi.reviewPrompt.${repoKey}`;
}

/** The raw stored prompt for a repo (empty string if none set). */
export function getReviewPrompt(repoKey: string): string {
  try {
    return localStorage.getItem(key(repoKey)) ?? "";
  } catch {
    return "";
  }
}

export function setReviewPrompt(repoKey: string, text: string): void {
  try {
    if (text.trim()) localStorage.setItem(key(repoKey), text);
    else localStorage.removeItem(key(repoKey));
  } catch {
    // ignore storage failures
  }
}

/** The prompt to actually use: the repo's custom prompt, else the default. */
export function effectiveReviewPrompt(repoKey: string): string {
  return getReviewPrompt(repoKey).trim() || DEFAULT_REVIEW_PROMPT;
}

export interface ResolvedReviewPrompt {
  prompt: string;
  warnings: string[];
  selectedProfile: string | null;
  availableProfiles: string[];
}

/** Resolve the prompt used by review runs, including repo-owned prompt extensions. */
export async function resolveReviewPrompt(
  repoKey: string,
  repoPath?: string | null,
  reviewProfile?: string | null,
): Promise<ResolvedReviewPrompt> {
  const localOverride = getReviewPrompt(repoKey).trim();
  if (localOverride) {
    return {
      prompt: localOverride,
      warnings: [],
      selectedProfile: reviewProfile?.trim() || null,
      availableProfiles: [],
    };
  }

  if (!repoPath?.trim()) {
    return {
      prompt: DEFAULT_REVIEW_PROMPT,
      warnings: [],
      selectedProfile: null,
      availableProfiles: [],
    };
  }

  const result = await tauriCall<RepoReviewConfigLoadResult>("validate_repo_review_config", {
    repoPath,
    reviewProfile: reviewProfile?.trim() || null,
  });
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  }

  const extension = result.config?.review?.prompt?.extend?.trim();
  const prompt = extension
    ? `${DEFAULT_REVIEW_PROMPT}\n\n## Repository review policy\n${extension}`
    : DEFAULT_REVIEW_PROMPT;

  return {
    prompt,
    warnings: result.warnings.map((warning) => warning.message),
    selectedProfile: result.selectedProfile,
    availableProfiles: Object.keys(result.config?.profiles ?? {}),
  };
}
