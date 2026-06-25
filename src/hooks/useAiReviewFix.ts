import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { AiReviewFixState } from "@/types";

interface StartFixArgs {
  payload: string;
  sourceBranch: string;
  destinationBranch: string;
}

interface UseAiReviewFixResult {
  state: AiReviewFixState | null;
  loading: boolean;
  refresh: () => Promise<void>;
  startFix: (args: StartFixArgs) => Promise<void>;
  startConflictResolution: (
    sourceBranch: string,
    destinationBranch: string,
    tips: string,
  ) => Promise<void>;
  startCommit: (message: string) => Promise<void>;
  startPush: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * Tracks the in-app Claude fix pipeline for a single PR thread.
 *
 * The backend owns the authoritative session state; the hook loads it on mount
 * and polls while a step is running so the UI can render live progress/logs.
 */
export function useAiReviewFix(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
  threadId: string | null,
): UseAiReviewFixResult {
  const [state, setState] = useState<AiReviewFixState | null>(null);
  const [loading, setLoading] = useState(false);
  const keyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace || !repo || prId == null) {
      setState(null);
      return;
    }
    const key = `${workspace}/${repo}/${prId}/${threadId ?? "default"}`;
    keyRef.current = key;
    const next = await tauriCall<AiReviewFixState | null>("get_ai_review_fix_state", {
      workspace,
      repo,
      id: prId,
      threadId,
    });
    if (keyRef.current === key) setState(next);
  }, [workspace, repo, prId, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state?.status !== "running") return;
    const timer = window.setInterval(() => {
      void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state, load]);

  const wrap = useCallback(
    async (action: () => Promise<AiReviewFixState | null | undefined>) => {
      setLoading(true);
      try {
        const result = await action();
        if (result) setState(result);
        else await load();
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  const startFix = useCallback(
    async ({ payload, sourceBranch, destinationBranch }: StartFixArgs) => {
      if (!workspace || !repo || prId == null) return;
      await wrap(async () =>
        tauriCall<AiReviewFixState>("start_ai_review_fix", {
          workspace,
          repo,
          id: prId,
          threadId,
          payload,
          sourceBranch,
          destinationBranch,
        }),
      );
    },
    [workspace, repo, prId, threadId, wrap],
  );

  const startCommit = useCallback(
    async (message: string) => {
      if (!workspace || !repo || prId == null) return;
      await wrap(async () =>
        tauriCall<AiReviewFixState>("start_ai_review_commit", {
          workspace,
          repo,
          id: prId,
          threadId,
          message,
        }),
      );
    },
    [workspace, repo, prId, threadId, wrap],
  );

  const startConflictResolution = useCallback(
    async (sourceBranch: string, destinationBranch: string, tips: string) => {
      if (!workspace || !repo || prId == null) return;
      await wrap(async () =>
        tauriCall<AiReviewFixState>("start_ai_conflict_resolution", {
          workspace,
          repo,
          id: prId,
          threadId,
          sourceBranch,
          destinationBranch,
          tips,
        }),
      );
    },
    [workspace, repo, prId, threadId, wrap],
  );

  const startPush = useCallback(async () => {
    if (!workspace || !repo || prId == null) return;
    await wrap(async () =>
      tauriCall<AiReviewFixState>("start_ai_review_push", {
        workspace,
        repo,
        id: prId,
        threadId,
      }),
    );
  }, [workspace, repo, prId, threadId, wrap]);

  const reset = useCallback(async () => {
    if (!workspace || !repo || prId == null) {
      setState(null);
      return;
    }
    await wrap(async () => {
      await tauriCall<void>("reset_ai_review_fix_state", {
        workspace,
        repo,
        id: prId,
        threadId,
      });
      setState(null);
      return undefined;
    });
  }, [workspace, repo, prId, threadId, wrap]);

  return {
    state,
    loading,
    refresh: load,
    startFix,
    startConflictResolution,
    startCommit,
    startPush,
    reset,
  };
}
