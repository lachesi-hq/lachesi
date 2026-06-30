import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { ClosedPrAnalyticsSnapshot, ClosedPrMetric, RepoRef } from "@/types";

interface UseClosedPrAnalyticsResult {
  metrics: ClosedPrMetric[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncedCount: number;
  reload: () => Promise<void>;
  sync: () => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useClosedPrAnalytics(repos: RepoRef[]): UseClosedPrAnalyticsResult {
  const [metrics, setMetrics] = useState<ClosedPrMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const reposKey = repos.map((repo) => `${repo.workspace}/${repo.repo}`).join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposKey keeps reload stable for equivalent repo arrays
  const reload = useCallback(async () => {
    if (repos.length === 0) {
      setMetrics([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snapshot = await tauriCall<ClosedPrAnalyticsSnapshot>("list_closed_pr_metrics", {
        repos,
      });
      setMetrics(snapshot.metrics);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [reposKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposKey keeps sync stable for equivalent repo arrays
  const sync = useCallback(async () => {
    if (repos.length === 0 || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const snapshot = await tauriCall<ClosedPrAnalyticsSnapshot>("sync_closed_pr_metrics", {
        repos,
        options: { limitPerState: 25 },
      });
      setMetrics(snapshot.metrics);
      setLastSyncedCount(snapshot.syncedCount);
    } catch (e) {
      setError(message(e));
    } finally {
      setSyncing(false);
    }
  }, [reposKey, syncing]);

  return { metrics, loading, syncing, error, lastSyncedCount, reload, sync };
}
