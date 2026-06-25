import { useEffect, useMemo } from "react";
import type { PrGroup } from "@/hooks/usePullRequests";
import { isTauri } from "@/lib/tauri";
import type { PullRequestSummary } from "@/types";

const SNAPSHOT_STORAGE_KEY = "lachesi.menuBar.prSnapshot.v1";
const TRAY_ID = "lachesi-main";
const MAX_MENU_PRS = 8;
const MAX_NOTIFICATIONS_PER_SYNC = 3;

interface PrSnapshotEntry {
  title: string;
  updatedOn: string;
  commentCount: number;
  state: string;
}

type PrSnapshot = Record<string, PrSnapshotEntry>;

interface UseMenuBarPrSyncArgs {
  groups: PrGroup[];
  loading: boolean;
  menuBarSyncEnabled: boolean;
  notificationsEnabled: boolean;
  onSync: () => Promise<void>;
  onOpenPr: (pr: PullRequestSummary) => void;
  onReviewPr?: (pr: PullRequestSummary) => Promise<void>;
  reviewingPrKey?: string | null;
}

let trayReady: Promise<void> | null = null;
let trayRef: import("@tauri-apps/api/tray").TrayIcon | null = null;

function prKey(pr: PullRequestSummary): string {
  return `${pr.workspace}/${pr.repo}#${pr.id}`;
}

function formatPrMenuLabel(pr: PullRequestSummary): string {
  const title = pr.title.length > 52 ? `${pr.title.slice(0, 49)}...` : pr.title;
  return `#${pr.id} ${title} (${pr.repo})`;
}

function prMenuId(pr: PullRequestSummary): string {
  return `pr-${encodeURIComponent(pr.workspace)}:${encodeURIComponent(pr.repo)}:${pr.id}`;
}

function parsePrMenuPayload(payload: string) {
  const [workspace, repo, id] = payload.split(":");
  if (!workspace || !repo || !id) return null;
  const prId = Number(id);
  if (!Number.isFinite(prId)) return null;
  return {
    workspace: decodeURIComponent(workspace),
    repo: decodeURIComponent(repo),
    id: prId,
  };
}

function buildSnapshot(prs: PullRequestSummary[]): PrSnapshot {
  const snapshot: PrSnapshot = {};
  for (const pr of prs) {
    snapshot[prKey(pr)] = {
      title: pr.title,
      updatedOn: pr.updatedOn,
      commentCount: pr.commentCount,
      state: pr.state,
    };
  }
  return snapshot;
}

function readSnapshot(): PrSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PrSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: PrSnapshot) {
  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Best effort only: notification dedupe should never break review flows.
  }
}

async function focusMainWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const window = getCurrentWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
}

async function ensureTray() {
  if (trayReady) return trayReady;

  trayReady = (async () => {
    const [{ defaultWindowIcon }, { TrayIcon }] = await Promise.all([
      import("@tauri-apps/api/app"),
      import("@tauri-apps/api/tray"),
    ]);
    const existing = await TrayIcon.getById(TRAY_ID);
    if (existing) {
      trayRef = existing;
      await trayRef.setTitle("");
      await trayRef.setTooltip("Lachesi");
      return;
    }
    const icon = await defaultWindowIcon();
    trayRef = await TrayIcon.new({
      id: TRAY_ID,
      icon: icon ?? undefined,
      iconAsTemplate: false,
      tooltip: "Lachesi",
      menuOnLeftClick: true,
      action: (event) => {
        if (event.type === "DoubleClick") {
          void focusMainWindow();
        }
      },
    });
  })();

  return trayReady;
}

async function updateTrayMenu(args: UseMenuBarPrSyncArgs, latestPrs: PullRequestSummary[]) {
  if (!isTauri()) return;
  await ensureTray();
  if (!trayRef) return;

  const { Menu } = await import("@tauri-apps/api/menu");
  const items = [
    {
      id: "open",
      text: "Open Lachesi",
      action: () => {
        void focusMainWindow();
      },
    },
    {
      id: "sync",
      text: args.loading ? "Syncing pull requests..." : "Sync pull requests",
      enabled: args.menuBarSyncEnabled && !args.loading,
      action: () => {
        if (!args.menuBarSyncEnabled) return;
        void args.onSync();
      },
    },
    {
      id: "latest-heading",
      text: latestPrs.length === 0 ? "No pull requests loaded" : "Latest pull requests",
      enabled: false,
    },
    ...latestPrs.flatMap((pr) => {
      const key = prKey(pr);
      const reviewing = args.reviewingPrKey === key;
      const items = [
        {
          id: prMenuId(pr),
          text: formatPrMenuLabel(pr),
          action: () => {
            void focusMainWindow().finally(() => args.onOpenPr(pr));
          },
        },
      ];
      if (args.onReviewPr) {
        items.push({
          id: `review-${prMenuId(pr)}`,
          text: reviewing ? `Reviewing #${pr.id}...` : `Review #${pr.id} in background`,
          action: () => {
            if (reviewing || !args.onReviewPr) return;
            void args.onReviewPr(pr);
          },
        });
      }
      return items;
    }),
  ];

  const menu = await Menu.new({ items });
  await trayRef.setTooltip(
    args.menuBarSyncEnabled ? "Lachesi pull requests" : "Lachesi pull request sync disabled",
  );
  await trayRef.setMenu(menu);
}

async function notifyPrChanges(prs: PullRequestSummary[]) {
  if (!isTauri() || prs.length === 0) return;

  const previous = readSnapshot();
  const next = buildSnapshot(prs);
  if (!previous) {
    writeSnapshot(next);
    return;
  }

  const changes: Array<{ title: string; body: string }> = [];
  for (const pr of prs) {
    const before = previous[prKey(pr)];
    if (!before) {
      changes.push({
        title: "New pull request",
        body: `${pr.repo} #${pr.id}: ${pr.title}`,
      });
      continue;
    }
    if (pr.commentCount > before.commentCount) {
      changes.push({
        title: "New PR comments",
        body: `${pr.repo} #${pr.id}: ${pr.commentCount - before.commentCount} new comment(s)`,
      });
      continue;
    }
    if (pr.updatedOn !== before.updatedOn || pr.state !== before.state) {
      changes.push({
        title: "Pull request updated",
        body: `${pr.repo} #${pr.id}: ${pr.title}`,
      });
    }
  }

  writeSnapshot(next);
  if (changes.length === 0) return;

  const { isPermissionGranted, requestPermission, sendNotification } = await import(
    "@tauri-apps/plugin-notification"
  );
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    permissionGranted = (await requestPermission()) === "granted";
  }
  if (!permissionGranted) return;

  for (const change of changes.slice(0, MAX_NOTIFICATIONS_PER_SYNC)) {
    sendNotification(change);
  }
  if (changes.length > MAX_NOTIFICATIONS_PER_SYNC) {
    sendNotification({
      title: "More pull request updates",
      body: `${changes.length - MAX_NOTIFICATIONS_PER_SYNC} additional update(s) in Lachesi.`,
    });
  }
}

export function useMenuBarPrSync({
  groups,
  loading,
  menuBarSyncEnabled,
  notificationsEnabled,
  onSync,
  onOpenPr,
  onReviewPr,
  reviewingPrKey,
}: UseMenuBarPrSyncArgs) {
  const pullRequests = useMemo(() => groups.flatMap((group) => group.pullRequests), [groups]);
  const latestPrs = useMemo(
    () =>
      [...pullRequests]
        .sort((a, b) => Date.parse(b.updatedOn) - Date.parse(a.updatedOn))
        .slice(0, MAX_MENU_PRS),
    [pullRequests],
  );

  useEffect(() => {
    void updateTrayMenu(
      {
        groups,
        loading,
        menuBarSyncEnabled,
        notificationsEnabled,
        onSync,
        onOpenPr,
        onReviewPr,
        reviewingPrKey,
      },
      latestPrs,
    ).catch((error) => {
      console.error("Failed to update Lachesi menu bar item:", error);
    });
  }, [
    groups,
    loading,
    latestPrs,
    menuBarSyncEnabled,
    notificationsEnabled,
    onSync,
    onOpenPr,
    onReviewPr,
    reviewingPrKey,
  ]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisten = Promise.all([
      import("@tauri-apps/api/event").then(({ listen }) =>
        listen("lachesi-menu-sync", () => {
          void onSync();
        }),
      ),
      import("@tauri-apps/api/event").then(({ listen }) =>
        listen<string>("lachesi-menu-open-pr", (event) => {
          const parsed = parsePrMenuPayload(event.payload);
          const pr =
            parsed &&
            pullRequests.find(
              (item) =>
                item.workspace === parsed.workspace &&
                item.repo === parsed.repo &&
                item.id === parsed.id,
            );
          if (pr) {
            void focusMainWindow().finally(() => onOpenPr(pr));
          }
        }),
      ),
    ]);
    return () => {
      disposed = true;
      void unlisten.then((callbacks) => {
        if (!disposed) return;
        for (const callback of callbacks) callback();
      });
    };
  }, [onSync, onOpenPr, pullRequests]);

  useEffect(() => {
    if (!notificationsEnabled || loading) return;
    void notifyPrChanges(pullRequests).catch((error) => {
      console.error("Failed to send Lachesi PR notification:", error);
    });
  }, [pullRequests, loading, notificationsEnabled]);
}
