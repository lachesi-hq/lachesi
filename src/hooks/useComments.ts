import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { PrComment } from "@/types";

interface UseCommentsResult {
  comments: PrComment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Loads all comments for a PR via IPC. */
export function useComments(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UseCommentsResult {
  const [comments, setComments] = useState<PrComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (prId == null || !workspace || !repo) {
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setComments(await tauriCall<PrComment[]>("list_comments", { workspace, repo, id: prId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspace, repo, prId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { comments, loading, error, refresh };
}
