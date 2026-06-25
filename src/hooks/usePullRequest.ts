import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { PullRequestDetail } from "@/types";

interface UsePullRequestResult {
  pr: PullRequestDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PullRequestDetail | null>;
}

/** Loads a single pull request's detail (header info) via IPC. */
export function usePullRequest(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UsePullRequestResult {
  const [pr, setPr] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (prId == null || !workspace || !repo) {
      setPr(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await tauriCall<PullRequestDetail>("get_pull_request", {
        workspace,
        repo,
        id: prId,
      });
      setPr(detail);
      return detail;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspace, repo, prId]);

  useEffect(() => {
    if (prId == null || !workspace || !repo) {
      setPr(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tauriCall<PullRequestDetail>("get_pull_request", { workspace, repo, id: prId })
      .then((detail) => {
        if (!cancelled) setPr(detail);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, repo, prId]);

  return { pr, loading, error, refresh };
}
