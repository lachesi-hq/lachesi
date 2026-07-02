import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { BranchStatus, ReviewProvider } from "@/types";

/** Loads how far the PR's source branch is behind/ahead of its destination. */
export function useBranchStatus(
  provider: ReviewProvider | null,
  workspace: string | null,
  repo: string | null,
  source: string | null,
  destination: string | null,
): {
  status: BranchStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<BranchStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspace || !repo || !source || !destination) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await tauriCall<BranchStatus>("get_branch_status", {
        provider,
        workspace,
        repo,
        source,
        destination,
      });
      setStatus(next);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [provider, workspace, repo, source, destination]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, loading, refresh: load };
}
