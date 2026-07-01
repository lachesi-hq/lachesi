import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type {
  ClosedPrAnalyticsSnapshot,
  ClosedPrAnalyticsSyncOptions,
  ClosedPrAnalyticsSyncResult,
  ClosedPrMetric,
  RepoRef,
} from "@/types";

interface UseClosedPrAnalyticsResult {
  metrics: ClosedPrMetric[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSync: ClosedPrAnalyticsSyncResult | null;
  reload: () => Promise<void>;
  sync: (options: ClosedPrAnalyticsSyncOptions) => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function updatedAfter(daysBack: number): string {
  const ms = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function useClosedPrAnalytics(repos: RepoRef[]): UseClosedPrAnalyticsResult {
  const [metrics, setMetrics] = useState<ClosedPrMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<ClosedPrAnalyticsSyncResult | null>(null);
  const reposKey = repos.map((repo) => `${repo.workspace}/${repo.repo}`).join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reposKey keeps reload stable for equivalent repo arrays
  const reload = useCallback(async () => {
    if (repos.length === 0) {
      setMetrics([]);
      setError(null);
      setLastSync(null);
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
  const sync = useCallback(
    async (options: ClosedPrAnalyticsSyncOptions) => {
      if (repos.length === 0 || syncing) return;
      setSyncing(true);
      setError(null);
      setLastSync(null);
      try {
        const snapshot = await tauriCall<ClosedPrAnalyticsSnapshot>("sync_closed_pr_metrics", {
          repos,
          options: {
            limitPerState: options.limitPerState,
            updatedAfter: updatedAfter(options.daysBack),
          },
        });
        setMetrics(snapshot.metrics);
        setLastSync({ ...options, syncedCount: snapshot.syncedCount });
      } catch (e) {
        setError(message(e));
      } finally {
        setSyncing(false);
      }
    },
    [reposKey, syncing],
  );

  return { metrics, loading, syncing, error, lastSync, reload, sync };
}
