// Jira issue keys are encoded by convention in branch names and PR titles
// (e.g. "feature/CB-2095-…", "CB-2066 - fix…"), so we can derive them without
// any explicit link. Standard Atlassian key shape: PROJECT-NUMBER.
const KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

/** Extract distinct Jira issue keys from the given strings (branch, title, …). */
export function extractIssueKeys(...sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.match(KEY_RE) ?? []) {
      if (!seen.has(match)) {
        seen.add(match);
        keys.push(match);
      }
    }
  }
  return keys;
}

/** Build the Jira web URL for an issue key, e.g. https://site.atlassian.net/browse/CB-2037 */
export function jiraBrowseUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/browse/${key}`;
}
