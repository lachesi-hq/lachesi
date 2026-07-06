import type { PullRequestSummary } from "@/types";

const STORAGE_KEY = "lachesi.menuBar.prSnapshot.v1";

export interface MenuBarPrSnapshotEntry {
  title: string;
  updatedOn: string;
  commentCount: number;
  state: string;
}

export type MenuBarPrSnapshot = Record<string, MenuBarPrSnapshotEntry>;

function snapshotKey(pr: PullRequestSummary): string {
  return `${pr.workspace}/${pr.repo}#${pr.id}`;
}

export function buildMenuBarPrSnapshot(prs: PullRequestSummary[]): MenuBarPrSnapshot {
  const snapshot: MenuBarPrSnapshot = {};
  for (const pr of prs) {
    snapshot[snapshotKey(pr)] = {
      title: pr.title,
      updatedOn: pr.updatedOn,
      commentCount: pr.commentCount,
      state: pr.state,
    };
  }
  return snapshot;
}

export function readMenuBarPrSnapshot(): MenuBarPrSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MenuBarPrSnapshot) : null;
  } catch {
    return null;
  }
}

export function writeMenuBarPrSnapshot(snapshot: MenuBarPrSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Best effort only: notification dedupe should never break review flows.
  }
}
