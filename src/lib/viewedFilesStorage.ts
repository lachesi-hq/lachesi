function storageKey(workspace: string, repo: string, prId: number): string {
  return `lachesi.viewedFiles.${workspace}/${repo}#${prId}`;
}

export function viewedFilesStorageKey(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): string | null {
  if (!workspace || !repo || prId == null) return null;
  return storageKey(workspace, repo, prId);
}

export function loadViewedFiles(key: string | null): Set<string> {
  if (!key || typeof localStorage === "undefined") return new Set();
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((item) => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function saveViewedFiles(key: string | null, viewed: Set<string>): void {
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...viewed]));
  } catch {
    // Viewed state is a convenience; ignore storage failures.
  }
}
