import { useEffect, useMemo, useState } from "react";
import { type FileData, parseUnifiedDiff } from "@/lib/diff";
import { tauriCall } from "@/lib/tauri";

interface UseDiffResult {
  files: FileData[];
  raw: string;
  loading: boolean;
  error: string | null;
}

/** Loads a PR's raw unified diff and parses it (memoized) into files. */
export function useDiff(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UseDiffResult {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prId == null || !workspace || !repo) {
      setRaw("");
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    tauriCall<string>("get_pr_diff", { workspace, repo, id: prId })
      .then((d) => {
        if (!cancelled) setRaw(d);
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

  const files = useMemo(() => parseUnifiedDiff(raw), [raw]);

  return { files, raw, loading, error };
}
