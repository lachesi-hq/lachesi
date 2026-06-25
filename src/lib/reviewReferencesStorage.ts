import type { ReviewReference } from "@/types";

function storageKey(workspace: string, repo: string, prId: number): string {
  return `lachesi.reviewReferences.${workspace}/${repo}/${prId}`;
}

function parseReferences(raw: string | null): ReviewReference[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ReviewReference =>
        item != null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.type === "string" &&
        typeof item.source === "string",
    );
  } catch {
    return [];
  }
}

export function loadReviewReferences(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): ReviewReference[] {
  if (!workspace || !repo || prId == null) return [];
  if (typeof localStorage === "undefined") return [];
  return parseReferences(localStorage.getItem(storageKey(workspace, repo, prId)));
}

export function saveReviewReferences(
  workspace: string,
  repo: string,
  prId: number,
  references: ReviewReference[],
): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(workspace, repo, prId), JSON.stringify(references));
}
