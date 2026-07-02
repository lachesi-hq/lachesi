import { useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { DiffstatEntry, ReviewProvider } from "@/types";

interface UseDiffstatResult {
  diffstat: DiffstatEntry[];
  loading: boolean;
  error: string | null;
}

/** Loads the per-file change summary for a PR via IPC. */
export function useDiffstat(
  provider: ReviewProvider | null,
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UseDiffstatResult {
  const [diffstat, setDiffstat] = useState<DiffstatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prId == null || !workspace || !repo) {
      setDiffstat([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tauriCall<DiffstatEntry[]>("get_diffstat", { provider, workspace, repo, id: prId })
      .then((d) => {
        if (!cancelled) setDiffstat(d);
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
  }, [provider, workspace, repo, prId]);

  return { diffstat, loading, error };
}
