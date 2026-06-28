import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { type AppPaneId, BottomPaneBar } from "@/components/BottomPaneBar";
import { OverviewPanel } from "@/components/overview/OverviewPanel";
import { PrDetailPanel } from "@/components/pr-detail/PrDetailPanel";
import type { AuthorOption } from "@/components/pr-sidebar/AuthorFilter";
import { PrSidebar } from "@/components/pr-sidebar/PrSidebar";
import { RepositoryBranchesPanel } from "@/components/repositories/RepositoryBranchesPanel";
import { AiReviewPanel } from "@/components/review/AiReviewPanel";
import { ReviewHistoryPanel } from "@/components/review-history/ReviewHistoryPanel";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { SettingsPage, type SettingsSaveInput } from "@/components/settings/SettingsDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAiReview } from "@/hooks/useAiReview";
import { useAiReviewFix } from "@/hooks/useAiReviewFix";
import { useConfig } from "@/hooks/useConfig";
import { useCredentials } from "@/hooks/useCredentials";
import { authorKey, useCurrentUser } from "@/hooks/useCurrentUser";
import { useDraftComments } from "@/hooks/useDraftComments";
import { useMenuBarPrSync } from "@/hooks/useMenuBarPrSync";
import { type PrGroup, usePullRequests } from "@/hooks/usePullRequests";
import { useReviewReferences } from "@/hooks/useReviewReferences";
import { useReviewTerminals } from "@/hooks/useReviewTerminals";
import { useTheme } from "@/hooks/useTheme";
import {
  buildAiReviewCommentDraftPayload,
  linkAiReviewDraftCommentsToFindings,
  normalizeAiReviewDraftComments,
} from "@/lib/aiReviewDraftComments";
import { buildReviewPromptDisplayMessage } from "@/lib/aiReviewPromptDisplay";
import { buildAiFixPayload } from "@/lib/buildAiFixPayload";
import { buildAiReviewPayloadForPr } from "@/lib/buildAiReviewPayloadForPr";
import { buildReviewPayload } from "@/lib/buildReviewPayload";
import { shouldIgnoreShortcut } from "@/lib/keyboard";
import {
  filterStageableAiReviewDraftComments,
  summarizeActiveReviewFindings,
} from "@/lib/reviewFindingPublication";
import { resolveReviewPrompt } from "@/lib/reviewPrompt";
import { tauriCall } from "@/lib/tauri";
import type {
  AiLineQuestionContext,
  AiReviewContext,
  AiReviewDraftCommentSuggestion,
  AiReviewJob,
  AiReviewJobStatus,
  AiReviewRunState,
  AppSelection,
  DraftComment,
  PrComment,
  PrListFilter,
  PullRequestSummary,
  RepoRef,
  ReviewFindingPublicationEvent,
} from "@/types";
import { repoKey } from "@/types";

const EMPTY_REPOS: RepoRef[] = [];

function lineQuestionLabel(context: AiLineQuestionContext): string {
  const line = context.to ?? context.from;
  return line == null ? context.path : `${context.path}:${line}`;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const { config, saveConfig } = useConfig();
  const { testConnection, saveCredentials, saveJiraToken, saveNotionToken } = useCredentials();
  const { terminals: reviewTerminalOptions } = useReviewTerminals();
  const [filter, setFilter] = useState<PrListFilter>("OPEN");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [repositoryFilter, setRepositoryFilter] = useState<string | null>(null);
  const [selection, setSelection] = useState<AppSelection>({ kind: "pr-list" });
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [repositoriesPanelOpen, setRepositoriesPanelOpen] = useState(false);
  const [reviewHistoryPanelOpen, setReviewHistoryPanelOpen] = useState(false);
  const [detailPaneOpen, setDetailPaneOpen] = useState(true);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewPanelExpanded, setReviewPanelExpanded] = useState(false);
  const [aiReviewContext, setAiReviewContext] = useState<AiReviewContext | null>(null);
  const [backgroundReviewPrKey, setBackgroundReviewPrKey] = useState<string | null>(null);
  const pendingReviewThreadIdRef = useRef<string | null>(null);

  const repos = config?.repos ?? EMPTY_REPOS;
  const { groups, loading, refresh, loadMore } = usePullRequests(repos, filter);
  const currentUser = useCurrentUser(repos.length > 0);
  const activeSel = selection.kind === "pr" ? selection : null;
  const activeRepo = activeSel
    ? (repos.find(
        (repo) => repo.workspace === activeSel.workspace && repo.repo === activeSel.repo,
      ) ?? null)
    : null;
  const aiReview = useAiReview(
    activeSel?.workspace ?? null,
    activeSel?.repo ?? null,
    activeSel?.prId ?? null,
  );
  const aiReviewFix = useAiReviewFix(
    activeSel?.workspace ?? null,
    activeSel?.repo ?? null,
    activeSel?.prId ?? null,
    aiReview.activeThread?.id ?? null,
  );
  const activeFindingPublication = useMemo(
    () => summarizeActiveReviewFindings(aiReview.store, aiReview.activeRun),
    [aiReview.store, aiReview.activeRun],
  );
  const aiReviewStore = aiReview.store;
  const setActiveAiReviewThread = aiReview.setActiveThread;

  const selectPullRequest = useCallback((pr: { workspace: string; repo: string; id: number }) => {
    setRepositoriesPanelOpen(false);
    setReviewHistoryPanelOpen(false);
    setDetailPaneOpen(true);
    setSelection({
      kind: "pr",
      workspace: pr.workspace,
      repo: pr.repo,
      prId: pr.id,
      activeFilePath: null,
    });
  }, []);

  const notifyReviewFinished = useCallback(
    async (title: string, body: string) => {
      if (!config?.notificationsEnabled) return;
      try {
        const { isPermissionGranted, requestPermission, sendNotification } = await import(
          "@tauri-apps/plugin-notification"
        );
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          permissionGranted = (await requestPermission()) === "granted";
        }
        if (permissionGranted) sendNotification({ title, body });
      } catch (error) {
        console.error("Failed to send AI review notification:", error);
      }
    },
    [config?.notificationsEnabled],
  );

  const runBackgroundMenuReview = useCallback(
    async (pr: PullRequestSummary) => {
      const key = `${pr.workspace}/${pr.repo}#${pr.id}`;
      if (backgroundReviewPrKey) return;
      setBackgroundReviewPrKey(key);
      let job: AiReviewJob | null = null;
      const updateJob = async (
        status: AiReviewJobStatus,
        threadId?: string | null,
        error?: string | null,
      ) => {
        if (!job) return;
        job = await tauriCall<AiReviewJob>("update_ai_review_job_status", {
          jobId: job.id,
          status,
          threadId: threadId ?? null,
          error: error ?? null,
        });
      };
      try {
        const repoConfig =
          repos.find((item) => item.workspace === pr.workspace && item.repo === pr.repo) ?? null;
        const { payload, pr: detail } = await buildAiReviewPayloadForPr({
          workspace: pr.workspace,
          repo: pr.repo,
          prId: pr.id,
          repoConfig,
          jiraBaseUrl: config?.jiraBaseUrl ?? null,
          jiraContextEnabled: Boolean(config?.hasJira && config?.jiraBaseUrl),
        });
        job = await tauriCall<AiReviewJob>("create_ai_review_job", {
          workspace: pr.workspace,
          repo: pr.repo,
          prId: pr.id,
          prTitle: detail.title || pr.title || `PR #${pr.id}`,
          sourceBranch: detail.sourceBranch,
          destinationBranch: detail.destinationBranch,
          trigger: "menuBar",
        });
        const started = await tauriCall<AiReviewRunState>("start_inline_review", {
          workspace: pr.workspace,
          repo: pr.repo,
          id: pr.id,
          title: detail.title || `PR #${pr.id}`,
          payload,
          sourceBranch: detail.sourceBranch,
          destinationBranch: detail.destinationBranch,
          aiProvider: config?.aiProvider ?? "claude",
          claudeModel: config?.claudeModel ?? null,
          claudeEffort: config?.claudeEffort ?? null,
          codexModel: config?.codexModel ?? null,
          codexEffort: config?.codexEffort ?? null,
        });
        await updateJob("running", started.threadId);

        let finalState: AiReviewRunState | null = null;
        for (let attempt = 0; attempt < 60 * 30; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          finalState = await tauriCall<AiReviewRunState | null>("get_ai_review_run_state", {
            workspace: pr.workspace,
            repo: pr.repo,
            id: pr.id,
          });
          if (finalState?.status !== "running") break;
        }

        if (
          activeSel?.workspace === pr.workspace &&
          activeSel.repo === pr.repo &&
          activeSel.prId === pr.id
        ) {
          await aiReview.refreshStore();
        }

        if (finalState?.status === "succeeded") {
          await updateJob("succeeded", finalState.threadId);
          await notifyReviewFinished("AI review finished", `${pr.repo} #${pr.id}: ${pr.title}`);
        } else if (finalState?.status === "failed") {
          await updateJob("failed", finalState.threadId, finalState.error);
          await notifyReviewFinished(
            "AI review failed",
            finalState.error || `${pr.repo} #${pr.id}: ${pr.title}`,
          );
        } else if (finalState?.status === "cancelled") {
          await updateJob("cancelled", finalState.threadId);
          await notifyReviewFinished("AI review cancelled", `${pr.repo} #${pr.id}: ${pr.title}`);
        } else {
          await updateJob(
            "failed",
            finalState?.threadId,
            "AI review did not finish before timeout.",
          );
        }
      } catch (error) {
        await updateJob("failed", null, error instanceof Error ? error.message : String(error));
        await notifyReviewFinished(
          "AI review failed",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setBackgroundReviewPrKey(null);
      }
    },
    [
      activeSel,
      aiReview.refreshStore,
      backgroundReviewPrKey,
      config?.aiProvider,
      config?.claudeEffort,
      config?.claudeModel,
      config?.codexEffort,
      config?.codexModel,
      config?.hasJira,
      config?.jiraBaseUrl,
      notifyReviewFinished,
      repos,
    ],
  );

  useMenuBarPrSync({
    groups,
    loading,
    menuBarSyncEnabled: config?.menuBarSyncEnabled ?? true,
    notificationsEnabled: config?.notificationsEnabled ?? false,
    onSync: refresh,
    onOpenPr: selectPullRequest,
    onReviewPr: runBackgroundMenuReview,
    reviewingPrKey: backgroundReviewPrKey,
  });

  const recordFindingPublicationEvents = async (
    events: ReviewFindingPublicationEvent[],
  ): Promise<void> => {
    if (!activeSel || events.length === 0) return;
    await tauriCall("record_ai_review_finding_publication", {
      workspace: activeSel.workspace,
      repo: activeSel.repo,
      id: activeSel.prId,
      events,
    });
    await aiReview.refreshStore();
  };

  const stageFindingDrafts = async (drafts: DraftComment[]): Promise<void> => {
    const events: ReviewFindingPublicationEvent[] = [];
    for (const draft of drafts) {
      if (!draft.findingRef) continue;
      events.push({
        kind: "stageDraft",
        reviewRunId: draft.findingRef.reviewRunId,
        findingFingerprint: draft.findingRef.findingFingerprint,
        mode: draft.publicationMode ?? "inline",
        draftId: draft.localId,
        remoteCommentId: null,
        publishedAt: null,
      });
    }
    await recordFindingPublicationEvents(events);
  };

  const removeFindingDrafts = async (drafts: DraftComment[]): Promise<void> => {
    const events: ReviewFindingPublicationEvent[] = [];
    for (const draft of drafts) {
      if (!draft.findingRef) continue;
      events.push({
        kind: "removeDraft",
        reviewRunId: draft.findingRef.reviewRunId,
        findingFingerprint: draft.findingRef.findingFingerprint,
        mode: draft.publicationMode ?? "inline",
        draftId: draft.localId,
        remoteCommentId: null,
        publishedAt: null,
      });
    }
    await recordFindingPublicationEvents(events);
  };

  const removeFindingDraft = async (draft: DraftComment): Promise<void> => {
    await removeFindingDrafts([draft]);
  };

  const publishFindingDraft = async (draft: DraftComment, comment: PrComment): Promise<void> => {
    if (!draft.findingRef) return;
    await recordFindingPublicationEvents([
      {
        kind: "publishDraft",
        reviewRunId: draft.findingRef.reviewRunId,
        findingFingerprint: draft.findingRef.findingFingerprint,
        mode: draft.publicationMode ?? "inline",
        draftId: draft.localId,
        remoteCommentId: comment.id,
        publishedAt: comment.createdOn || null,
      },
    ]);
  };

  const draftComments = useDraftComments(
    activeSel?.workspace ?? null,
    activeSel?.repo ?? null,
    activeSel?.prId ?? null,
    {
      onDraftPublished: publishFindingDraft,
      onDraftRemoved: removeFindingDraft,
      onDraftsDiscarded: async (drafts) => {
        await removeFindingDrafts(drafts);
      },
    },
  );
  const reviewReferences = useReviewReferences(
    activeSel?.workspace ?? null,
    activeSel?.repo ?? null,
    activeSel?.prId ?? null,
  );
  const meKey = currentUser ? authorKey(currentUser.accountId, currentUser.displayName) : null;

  // First run (or all repos removed): nudge the user to configure.
  useEffect(() => {
    if (config && config.repos.length === 0) setSelection({ kind: "settings" });
  }, [config]);

  useEffect(() => {
    if (selection.kind === "overview" || selection.kind === "settings") {
      setRepositoriesPanelOpen(false);
      setReviewHistoryPanelOpen(false);
    }
    if (!activeSel) {
      setAiReviewContext(null);
      setReviewPanelOpen(false);
      setReviewPanelExpanded(false);
      return;
    }
    setAiReviewContext(null);
    setReviewPanelExpanded(false);
  }, [activeSel, selection.kind]);

  useEffect(() => {
    const pendingReviewThreadId = pendingReviewThreadIdRef.current;
    if (!pendingReviewThreadId || !activeSel || !aiReviewStore) return;
    const exists = aiReviewStore.threads.some((thread) => thread.id === pendingReviewThreadId);
    if (!exists) {
      pendingReviewThreadIdRef.current = null;
      return;
    }
    void setActiveAiReviewThread(pendingReviewThreadId).finally(() => {
      pendingReviewThreadIdRef.current = null;
    });
  }, [activeSel, aiReviewStore, setActiveAiReviewThread]);

  // Distinct authors across the loaded PRs, with the current user pinned first.
  const authors: AuthorOption[] = (() => {
    const map = new Map<string, AuthorOption>();
    for (const group of groups) {
      for (const pr of group.pullRequests) {
        const key = authorKey(pr.authorAccountId, pr.authorDisplayName);
        if (!map.has(key)) {
          map.set(key, { key, label: pr.authorDisplayName, isMe: meKey != null && key === meKey });
        }
      }
    }
    if (meKey && currentUser && !map.has(meKey)) {
      map.set(meKey, { key: meKey, label: currentUser.displayName, isMe: true });
    }
    return [...map.values()].sort((a, b) =>
      a.isMe ? -1 : b.isMe ? 1 : a.label.localeCompare(b.label),
    );
  })();

  const repositories = groups.map((group) => ({
    key: repoKey(group.repo),
    label: `${group.repo.workspace}/${group.repo.repo}`,
    count: group.pullRequests.length,
  }));
  const availableReviewReferencePullRequests = groups.flatMap((group) =>
    group.pullRequests.filter(
      (pr) =>
        activeSel == null ||
        pr.workspace !== activeSel.workspace ||
        pr.repo !== activeSel.repo ||
        pr.id !== activeSel.prId,
    ),
  );

  useEffect(() => {
    if (repositoryFilter == null) return;
    if (groups.some((group) => repoKey(group.repo) === repositoryFilter)) return;
    setRepositoryFilter(null);
  }, [groups, repositoryFilter]);

  const displayedGroups: PrGroup[] = groups
    .filter((group) => repositoryFilter == null || repoKey(group.repo) === repositoryFilter)
    .map((group) => ({
      ...group,
      pullRequests:
        authorFilter == null
          ? group.pullRequests
          : group.pullRequests.filter(
              (pr) => authorKey(pr.authorAccountId, pr.authorDisplayName) === authorFilter,
            ),
    }));

  // Keyboard: ? = help, o = overview, j / k = next / previous pull request across the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "o" && selection.kind !== "overview") {
        e.preventDefault();
        setSelection({ kind: "overview" });
        return;
      }
      if (e.key === "Escape" && selection.kind === "overview") {
        e.preventDefault();
        setSelection({ kind: "pr-list" });
        return;
      }
      if (e.key === "r" && selection.kind === "pr") {
        e.preventDefault();
        setReviewPanelOpen((prev) => !prev);
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      const flat = displayedGroups.flatMap((g) => g.pullRequests);
      if (flat.length === 0) return;
      const idx = flat.findIndex(
        (pr) =>
          activeSel != null &&
          pr.id === activeSel.prId &&
          pr.workspace === activeSel.workspace &&
          pr.repo === activeSel.repo,
      );
      const next =
        e.key === "j"
          ? Math.min(idx < 0 ? 0 : idx + 1, flat.length - 1)
          : Math.max(idx < 0 ? 0 : idx - 1, 0);
      const pr = flat[next];
      if (pr) {
        e.preventDefault();
        setSelection({
          kind: "pr",
          workspace: pr.workspace,
          repo: pr.repo,
          prId: pr.id,
          activeFilePath: null,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayedGroups, activeSel, selection]);

  const isOverview = selection.kind === "overview";
  const openPaneCount = [
    sidebarOpen,
    repositoriesPanelOpen,
    reviewHistoryPanelOpen,
    detailPaneOpen,
    reviewPanelOpen,
  ].filter(Boolean).length;
  const paneStatus = `${openPaneCount} pane${openPaneCount === 1 ? "" : "s"} open`;

  const buildActiveReviewRequest = async (): Promise<{
    payload: string;
    displayMessage: string;
  } | null> => {
    if (!activeSel || !aiReviewContext) return null;
    const { prompt, warnings } = await resolveReviewPrompt(
      `${activeSel.workspace}/${activeSel.repo}`,
      activeRepo?.localPath,
    );
    if (warnings.length > 0) {
      console.warn("Lachesi repo config warnings:", warnings);
    }
    const payload = buildReviewPayload({
      prompt,
      pr: aiReviewContext.pr,
      branchStatus: aiReviewContext.branchStatus,
      rawDiff: aiReviewContext.rawDiff,
      jiraKeys: aiReviewContext.jiraKeys,
      jiraBaseUrl: aiReviewContext.jiraBaseUrl,
      jiraContext: aiReviewContext.jiraContext,
      reviewReferences: reviewReferences.references,
    });
    return {
      payload,
      displayMessage: buildReviewPromptDisplayMessage(payload),
    };
  };

  const buildActiveReviewPayload = async (): Promise<string | null> => {
    return (await buildActiveReviewRequest())?.payload ?? null;
  };

  const buildLineQuestionRequest = async (
    lineContext: AiLineQuestionContext,
    question: string,
  ): Promise<{ payload: string; displayMessage: string } | null> => {
    if (!activeSel || !aiReviewContext) return null;
    const label = lineQuestionLabel(lineContext);
    const displayMessage = [`Question about \`${label}\``, "", question.trim()].join("\n");
    const payload = [
      "You are answering a focused reviewer question about one changed line in a pull request.",
      "Answer directly and concisely.",
      "",
      "## Pull request",
      `${aiReviewContext.pr.title} (#${aiReviewContext.pr.id})`,
      `Branch: ${aiReviewContext.pr.sourceBranch} -> ${aiReviewContext.pr.destinationBranch}`,
      "",
      "## Selected line",
      `File: ${lineContext.path}`,
      `Side: ${lineContext.side}`,
      lineContext.to != null ? `New line: ${lineContext.to}` : null,
      lineContext.from != null ? `Old line: ${lineContext.from}` : null,
      `Selected line: ${lineContext.lineText}`,
      "",
      "## Diff hunk",
      "```diff",
      lineContext.hunkDiff.trim(),
      "```",
      "",
      "## Reviewer question",
      question.trim(),
    ]
      .filter((line): line is string => line != null)
      .join("\n");
    return { payload, displayMessage };
  };

  const hasAssistantReview =
    aiReview.activeThread?.messages.some((message) => message.role === "assistant") ?? false;
  const reviewForFix = hasAssistantReview ? aiReview.activeThread : null;
  const fixPayload =
    reviewForFix && aiReviewContext
      ? buildAiFixPayload({
          pr: aiReviewContext.pr,
          thread: reviewForFix,
          branchStatus: aiReviewContext.branchStatus,
          rawDiff: aiReviewContext.rawDiff,
          jiraKeys: aiReviewContext.jiraKeys,
          jiraBaseUrl: aiReviewContext.jiraBaseUrl,
          jiraContext: aiReviewContext.jiraContext,
        })
      : null;

  const handleRunInlineReview = (
    payload: string,
    displayMessage?: string | null,
    options: { reviewKind?: "lineQuestion"; threadTitle?: string; skipAnalyzers?: boolean } = {},
  ) => {
    if (!activeSel || !aiReviewContext) return;
    const selectionForReview = activeSel;
    const contextForReview = aiReviewContext;
    setReviewPanelOpen(true);
    void (async () => {
      let job: AiReviewJob | null = null;
      const updateJob = async (
        status: AiReviewJobStatus,
        threadId?: string | null,
        error?: string | null,
      ) => {
        if (!job) return;
        job = await tauriCall<AiReviewJob>("update_ai_review_job_status", {
          jobId: job.id,
          status,
          threadId: threadId ?? null,
          error: error ?? null,
        });
      };
      try {
        job = await tauriCall<AiReviewJob>("create_ai_review_job", {
          workspace: selectionForReview.workspace,
          repo: selectionForReview.repo,
          prId: selectionForReview.prId,
          prTitle: contextForReview.pr.title || `PR #${selectionForReview.prId}`,
          sourceBranch: contextForReview.pr.sourceBranch,
          destinationBranch: contextForReview.pr.destinationBranch,
          trigger: "manual",
        });
        await aiReview.run({
          payload,
          displayMessage,
          reviewKind: options.reviewKind ?? null,
          threadTitle: options.threadTitle ?? null,
          skipAnalyzers: options.skipAnalyzers ?? false,
          title: contextForReview.pr.title || `PR #${selectionForReview.prId}`,
          sourceBranch: contextForReview.pr.sourceBranch,
          destinationBranch: contextForReview.pr.destinationBranch,
          aiProvider: config?.aiProvider ?? "claude",
          claudeModel: config?.claudeModel ?? null,
          claudeEffort: config?.claudeEffort ?? null,
          codexModel: config?.codexModel ?? null,
          codexEffort: config?.codexEffort ?? null,
        });

        let finalState: AiReviewRunState | null = null;
        for (let attempt = 0; attempt < 60 * 30; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          finalState = await tauriCall<AiReviewRunState | null>("get_ai_review_run_state", {
            workspace: selectionForReview.workspace,
            repo: selectionForReview.repo,
            id: selectionForReview.prId,
          });
          if (finalState?.status === "running") {
            await updateJob("running", finalState.threadId);
            continue;
          }
          break;
        }

        if (finalState?.status === "succeeded") {
          await updateJob("succeeded", finalState.threadId);
        } else if (finalState?.status === "failed") {
          await updateJob("failed", finalState.threadId, finalState.error);
        } else if (finalState?.status === "cancelled") {
          await updateJob("cancelled", finalState.threadId);
        } else {
          await updateJob(
            "failed",
            finalState?.threadId,
            "AI review did not finish before timeout.",
          );
        }
      } catch (error) {
        await updateJob("failed", null, error instanceof Error ? error.message : String(error));
      }
    })();
  };

  const handleRunNewReview = async () => {
    if (!activeSel || !aiReviewContext) return;
    try {
      const request = await buildActiveReviewRequest();
      if (!request) return;
      if (aiReview.activeThread?.id) {
        setReviewPanelOpen(true);
        void aiReview.reply({
          title: aiReviewContext.pr.title || `PR #${activeSel.prId}`,
          sourceBranch: aiReviewContext.pr.sourceBranch,
          destinationBranch: aiReviewContext.pr.destinationBranch,
          threadId: aiReview.activeThread.id,
          userMessage: request.displayMessage,
          basePayload: request.payload,
          aiProvider: config?.aiProvider ?? "claude",
          claudeModel: config?.claudeModel ?? null,
          claudeEffort: config?.claudeEffort ?? null,
          codexModel: config?.codexModel ?? null,
          codexEffort: config?.codexEffort ?? null,
        });
      } else {
        handleRunInlineReview(request.payload, request.displayMessage);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleAskClaude = async (userMessage: string) => {
    try {
      const basePayload = await buildActiveReviewPayload();
      if (!basePayload) return;
      const payload = [
        basePayload.trim(),
        "",
        "## Initial question from the reviewer",
        userMessage.trim(),
      ].join("\n");
      handleRunInlineReview(payload, userMessage.trim());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleAskAiLine = async (lineContext: AiLineQuestionContext, question: string) => {
    try {
      const request = await buildLineQuestionRequest(lineContext, question);
      if (!request) return;
      handleRunInlineReview(request.payload, request.displayMessage, {
        reviewKind: "lineQuestion",
        threadTitle: "Line question",
        skipAnalyzers: true,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleReplyToReview = async (threadId: string, userMessage: string) => {
    if (!activeSel || !aiReviewContext) return;
    try {
      const basePayload = await buildActiveReviewPayload();
      if (!basePayload) return;
      setReviewPanelOpen(true);
      void aiReview.reply({
        title: aiReviewContext.pr.title || `PR #${activeSel.prId}`,
        sourceBranch: aiReviewContext.pr.sourceBranch,
        destinationBranch: aiReviewContext.pr.destinationBranch,
        threadId,
        userMessage,
        basePayload,
        aiProvider: config?.aiProvider ?? "claude",
        claudeModel: config?.claudeModel ?? null,
        claudeEffort: config?.claudeEffort ?? null,
        codexModel: config?.codexModel ?? null,
        codexEffort: config?.codexEffort ?? null,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleClearReview = (threadId: string) => {
    void aiReviewFix.reset().finally(() => aiReview.clearThread(threadId));
  };

  const handleCloseReviewPanel = () => {
    setReviewPanelOpen(false);
    setReviewPanelExpanded(false);
  };

  const handleResolveBranchConflicts = async (
    sourceBranch: string,
    destinationBranch: string,
    tips: string,
  ) => {
    setReviewPanelOpen(true);
    setReviewPanelExpanded(false);
    await aiReviewFix.startConflictResolution(sourceBranch, destinationBranch, tips);
  };

  const handleStageAiReviewComments = async () => {
    if (!activeSel || !aiReviewContext || !aiReview.activeThread) {
      return {
        added: 0,
        skipped: 0,
        skippedUnanchored: 0,
        skippedExistingDrafts: 0,
        skippedAlreadyStaged: 0,
        skippedAlreadyPublished: 0,
      };
    }

    const payload = buildAiReviewCommentDraftPayload({
      pr: aiReviewContext.pr,
      thread: aiReview.activeThread,
      reviewRun: aiReview.activeRun,
      branchStatus: aiReviewContext.branchStatus,
      rawDiff: aiReviewContext.rawDiff,
      jiraKeys: aiReviewContext.jiraKeys,
      jiraBaseUrl: aiReviewContext.jiraBaseUrl,
      jiraContext: aiReviewContext.jiraContext,
    });

    const suggestions = await tauriCall<AiReviewDraftCommentSuggestion[]>(
      "draft_ai_review_comments",
      {
        workspace: activeSel.workspace,
        repo: activeSel.repo,
        id: activeSel.prId,
        payload,
      },
    );

    const normalized = normalizeAiReviewDraftComments(aiReviewContext.rawDiff, suggestions);
    const linked = linkAiReviewDraftCommentsToFindings(aiReview.activeRun, normalized.comments);
    const filtered = filterStageableAiReviewDraftComments(
      linked,
      draftComments.drafts,
      activeFindingPublication,
    );
    const stageableComments = filtered.stageable;

    const stagedDrafts = draftComments.addDrafts(
      stageableComments.map((comment) => ({
        path: comment.path,
        to: comment.to,
        from: comment.from,
        raw: comment.raw,
        parentId: null,
        source: comment.findingRef ? "aiFinding" : "manual",
        findingRef: comment.findingRef,
        publicationMode: comment.publicationMode,
      })),
    );
    await stageFindingDrafts(stagedDrafts);
    if (stageableComments.length > 0) {
      setDetailPaneOpen(true);
    }
    const skippedUnanchored = normalized.skipped;
    const skipped = skippedUnanchored + filtered.skipped;
    return {
      added: stageableComments.length,
      skipped,
      skippedUnanchored,
      skippedExistingDrafts: filtered.skippedExistingDrafts,
      skippedAlreadyStaged: filtered.skippedAlreadyStaged,
      skippedAlreadyPublished: filtered.skippedAlreadyPublished,
    };
  };

  const handleTogglePane = (pane: AppPaneId) => {
    const next = {
      pullRequests: pane === "pullRequests" ? !sidebarOpen : sidebarOpen,
      repositories: pane === "repositories" ? !repositoriesPanelOpen : repositoriesPanelOpen,
      reviewHistory: pane === "reviewHistory" ? !reviewHistoryPanelOpen : reviewHistoryPanelOpen,
      details: pane === "details" ? !detailPaneOpen : detailPaneOpen,
      aiReview: pane === "aiReview" ? !reviewPanelOpen : reviewPanelOpen,
    };
    if (!next.pullRequests && !next.repositories && !next.details && !next.aiReview) return;

    if (pane === "pullRequests") {
      setSidebarOpen((prev) => !prev);
      return;
    }
    if (pane === "repositories") {
      setRepositoriesPanelOpen((prev) => {
        const open = !prev;
        if (open) setReviewHistoryPanelOpen(false);
        return open;
      });
      return;
    }
    if (pane === "reviewHistory") {
      setReviewHistoryPanelOpen((prev) => {
        const open = !prev;
        if (open) setRepositoriesPanelOpen(false);
        return open;
      });
      return;
    }
    if (pane === "details") {
      setDetailPaneOpen((prev) => !prev);
      return;
    }
    setReviewPanelOpen((prev) => {
      const open = !prev;
      if (!open) setReviewPanelExpanded(false);
      return open;
    });
  };

  const handleSelectReviewJob = (job: AiReviewJob) => {
    if (job.threadId) {
      pendingReviewThreadIdRef.current = job.threadId;
      setReviewPanelOpen(true);
    }
    selectPullRequest({ workspace: job.workspace, repo: job.repo, id: job.prId });
  };

  const handleSaveSettings = async ({
    repos: nextRepos,
    defaultDiffView,
    reviewTerminal,
    aiProvider,
    claudeModel,
    claudeEffort,
    codexModel,
    codexEffort,
    jiraBaseUrl,
    menuBarSyncEnabled,
    notificationsEnabled,
    username,
    token,
    jiraToken,
    notionToken,
  }: SettingsSaveInput) => {
    if (username && token) {
      await saveCredentials(username, token);
    }
    if (jiraToken) await saveJiraToken(jiraToken);
    if (notionToken) await saveNotionToken(notionToken);
    await saveConfig({
      repos: nextRepos,
      defaultDiffView,
      theme,
      reviewTerminal,
      aiProvider,
      claudeModel,
      claudeEffort,
      codexModel,
      codexEffort,
      jiraBaseUrl,
      menuBarSyncEnabled,
      notificationsEnabled,
    });
  };

  return (
    <>
      <AppShell
        headerRight={<ThemeToggle theme={theme} onToggle={toggle} />}
        footer={
          isOverview || selection.kind === "settings" ? undefined : (
            <BottomPaneBar
              panes={{
                pullRequests: sidebarOpen,
                repositories: repositoriesPanelOpen,
                reviewHistory: reviewHistoryPanelOpen,
                details: detailPaneOpen,
                aiReview: reviewPanelOpen,
              }}
              disabled={{ aiReview: activeSel == null && !reviewPanelOpen }}
              status={paneStatus}
              onTogglePane={handleTogglePane}
            />
          )
        }
        rightPanelExpanded={reviewPanelExpanded}
        rightPanel={
          reviewPanelOpen && activeSel ? (
            <AiReviewPanel
              key={`${activeSel.workspace}/${activeSel.repo}/${activeSel.prId}`}
              store={aiReview.store}
              activeThread={aiReview.activeThread}
              activeRun={aiReview.activeRun}
              reviewState={aiReview.state}
              aiProvider={config?.aiProvider ?? "claude"}
              loading={aiReview.loading}
              error={aiReview.error}
              onRun={aiReviewContext ? handleRunNewReview : undefined}
              onAsk={aiReviewContext ? handleAskClaude : undefined}
              onReply={aiReviewContext ? handleReplyToReview : undefined}
              onCancelReview={() => aiReview.cancel()}
              onSelectThread={(threadId) => aiReview.setActiveThread(threadId)}
              onClearThread={handleClearReview}
              onClose={handleCloseReviewPanel}
              expanded={reviewPanelExpanded}
              onToggleExpand={() => setReviewPanelExpanded((prev) => !prev)}
              onStageComments={handleStageAiReviewComments}
              fixState={aiReviewFix.state}
              fixBusy={aiReviewFix.loading}
              onStartFix={
                reviewForFix && aiReviewContext && fixPayload
                  ? () =>
                      aiReviewFix.startFix({
                        payload: fixPayload,
                        sourceBranch: aiReviewContext.pr.sourceBranch,
                        destinationBranch: aiReviewContext.pr.destinationBranch,
                      })
                  : undefined
              }
              onCommit={(message) => aiReviewFix.startCommit(message)}
              onPush={() => aiReviewFix.startPush()}
            />
          ) : undefined
        }
        sidebar={
          isOverview || selection.kind === "settings" || !sidebarOpen ? undefined : (
            <PrSidebar
              groups={displayedGroups}
              filter={filter}
              loading={loading}
              active={
                activeSel
                  ? { workspace: activeSel.workspace, repo: activeSel.repo, prId: activeSel.prId }
                  : null
              }
              authors={authors}
              authorFilter={authorFilter}
              repositories={repositories}
              repositoryFilter={repositoryFilter}
              onFilterChange={setFilter}
              onAuthorFilterChange={setAuthorFilter}
              onRepositoryFilterChange={setRepositoryFilter}
              onSelect={(pr) => {
                selectPullRequest(pr);
              }}
              onLoadMore={loadMore}
              onRefresh={refresh}
              onOpenSettings={() => setSelection({ kind: "settings" })}
              onOpenOverview={() => setSelection({ kind: "overview" })}
            />
          )
        }
        main={
          isOverview ? (
            <OverviewPanel
              groups={groups}
              loading={loading}
              onRefresh={refresh}
              onBack={() => setSelection({ kind: "pr-list" })}
              onSelectPr={(pr) => selectPullRequest(pr)}
              currentUser={currentUser}
            />
          ) : selection.kind === "settings" ? (
            <SettingsPage
              repos={repos}
              defaultDiffView={config?.defaultDiffView ?? "unified"}
              reviewTerminal={config?.reviewTerminal ?? null}
              aiProvider={config?.aiProvider ?? "claude"}
              claudeModel={config?.claudeModel ?? null}
              claudeEffort={config?.claudeEffort ?? null}
              codexModel={config?.codexModel ?? null}
              codexEffort={config?.codexEffort ?? null}
              reviewTerminalOptions={reviewTerminalOptions}
              jiraBaseUrl={config?.jiraBaseUrl ?? null}
              menuBarSyncEnabled={config?.menuBarSyncEnabled ?? true}
              notificationsEnabled={config?.notificationsEnabled ?? false}
              hasCredentials={config?.hasCredentials ?? false}
              hasJira={config?.hasJira ?? false}
              hasNotion={config?.hasNotion ?? false}
              onTestConnection={testConnection}
              onSave={handleSaveSettings}
              onBack={() => setSelection({ kind: "pr-list" })}
            />
          ) : repositoriesPanelOpen ? (
            <RepositoryBranchesPanel />
          ) : reviewHistoryPanelOpen ? (
            <ReviewHistoryPanel onSelectJob={handleSelectReviewJob} />
          ) : detailPaneOpen ? (
            <PrDetailPanel
              workspace={activeSel?.workspace ?? null}
              repo={activeSel?.repo ?? null}
              prId={activeSel?.prId ?? null}
              currentUserAccountId={currentUser?.accountId ?? null}
              currentUserDisplayName={currentUser?.displayName ?? null}
              defaultViewMode={config?.defaultDiffView ?? "unified"}
              jiraBaseUrl={config?.jiraBaseUrl ?? null}
              jiraContextEnabled={Boolean(config?.hasJira && config?.jiraBaseUrl)}
              availablePullRequests={availableReviewReferencePullRequests}
              availableRepositories={repos}
              reviewReferences={reviewReferences.references}
              addReviewReference={reviewReferences.addReference}
              updateReviewReference={reviewReferences.updateReference}
              removeReviewReference={reviewReferences.removeReference}
              onOpenAiReview={() => setReviewPanelOpen(true)}
              onResolveBranchConflicts={handleResolveBranchConflicts}
              onAiReviewContextChange={setAiReviewContext}
              onAskAiLine={handleAskAiLine}
              drafts={draftComments.drafts}
              publishing={draftComments.publishing}
              publishingDraftId={draftComments.publishingDraftId}
              addDraft={draftComments.addDraft}
              updateDraft={draftComments.updateDraft}
              removeDraft={draftComments.removeDraft}
              discardAll={draftComments.discardAll}
              publishDraft={draftComments.publishDraft}
              publishAll={draftComments.publishAll}
            />
          ) : undefined
        }
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
