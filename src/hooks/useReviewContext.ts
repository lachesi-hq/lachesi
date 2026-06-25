import { useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { JiraIssue, NotionPage } from "@/types";

/**
 * When enabled (Jira configured + token set), fetches the Jira issue(s) for the
 * given keys and the Notion pages linked inside them, returning a text blob to
 * inline into the AI review payload. Returns null when disabled or empty.
 */
export function useReviewContext(jiraKeys: string[], enabled: boolean): string | null {
  const [context, setContext] = useState<string | null>(null);
  const keyList = jiraKeys.join(",");

  useEffect(() => {
    const keys = keyList ? keyList.split(",") : [];
    if (!enabled || keys.length === 0) {
      setContext(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const parts: string[] = [];
      for (const key of keys) {
        try {
          const issue = await tauriCall<JiraIssue>("get_jira_issue", { key });
          parts.push(
            `### ${issue.key} — ${issue.summary}${issue.status ? ` (${issue.status})` : ""}`,
          );
          if (issue.descriptionText) parts.push(issue.descriptionText);
          for (const url of issue.notionUrls) {
            try {
              const page = await tauriCall<NotionPage>("get_notion_page", { url });
              parts.push(`#### Notion: ${page.title || url}`);
              if (page.text) parts.push(page.text);
            } catch {
              // skip a page we can't read
            }
          }
        } catch {
          // skip an issue we can't fetch
        }
      }
      if (!cancelled) setContext(parts.length > 0 ? parts.join("\n\n") : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [keyList, enabled]);

  return context;
}
