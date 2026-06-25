import { useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { DiffstatEntry } from "@/types";

interface UseDiffstatResult {
  diffstat: DiffstatEntry[];
  loading: boolean;
  error: string | null;
}

/** Loads the per-file change summary for a PR via IPC. */
export function useDiffstat(
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
    tauriCall<DiffstatEntry[]>("get_diffstat", { workspace, repo, id: prId })
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
  }, [workspace, repo, prId]);

  return { diffstat, loading, error };
}
