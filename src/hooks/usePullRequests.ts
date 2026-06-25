import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import {
  type PrListFilter,
  type PullRequestPage,
  type PullRequestSummary,
  type RepoRef,
  repoKey,
} from "@/types";

export interface PrGroup {
  repo: RepoRef;
  pullRequests: PullRequestSummary[];
  page: number;
  hasNext: boolean;
  loadingMore: boolean;
  error: string | null;
}

interface UsePullRequestsResult {
  groups: PrGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: (repo: RepoRef) => Promise<void>;
}

const PAGELEN = 30;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Loads pull requests for every configured repo, grouped by repo, with
 * independent per-repo pagination (load more). "DRAFT" maps to backend OPEN
 * with a client-side draft filter. One repo failing doesn't fail the others.
 */
export function usePullRequests(repos: RepoRef[], filter: PrListFilter): UsePullRequestsResult {
  const [groups, setGroups] = useState<PrGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const groupsRef = useRef<PrGroup[]>([]);
  groupsRef.current = groups;

  // Content-based key so a fresh array with the same repos doesn't re-fetch.
  const reposKey = repos.map(repoKey).join("|");

  const fetchPage = useCallback(
    async (repo: RepoRef, page: number) => {
      const backendState = filter === "DRAFT" ? "OPEN" : filter;
      const res = await tauriCall<PullRequestPage>("list_pull_requests", {
        workspace: repo.workspace,
        repo: repo.repo,
        opts: { state: backendState, page, pagelen: PAGELEN },
      });
      const values = filter === "DRAFT" ? res.values.filter((pr) => pr.draft) : res.values;
      const tagged = values.map((pr) => ({ ...pr, workspace: repo.workspace, repo: repo.repo }));
      return { tagged, hasNext: res.hasNext };
    },
    [filter],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is keyed by reposKey (derived from repos)
  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      repos.map(async (repo): Promise<PrGroup> => {
        try {
          const { tagged, hasNext } = await fetchPage(repo, 1);
          return { repo, pullRequests: tagged, page: 1, hasNext, loadingMore: false, error: null };
        } catch (e) {
          return {
            repo,
            pullRequests: [],
            page: 1,
            hasNext: false,
            loadingMore: false,
            error: message(e),
          };
        }
      }),
    );
    setGroups(results);
    setLoading(false);
  }, [reposKey, fetchPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = useCallback(
    async (repo: RepoRef) => {
      const key = repoKey(repo);
      const current = groupsRef.current.find((g) => repoKey(g.repo) === key);
      if (!current) return;
      if (!current.hasNext || current.loadingMore) return;
      const nextPage = current.page + 1;
      setGroups((prev) =>
        prev.map((g) => (repoKey(g.repo) === key ? { ...g, loadingMore: true } : g)),
      );
      try {
        const { tagged, hasNext } = await fetchPage(repo, nextPage);
        setGroups((prev) =>
          prev.map((g) =>
            repoKey(g.repo) === key
              ? {
                  ...g,
                  pullRequests: [...g.pullRequests, ...tagged],
                  page: nextPage,
                  hasNext,
                  loadingMore: false,
                }
              : g,
          ),
        );
      } catch {
        setGroups((prev) =>
          prev.map((g) => (repoKey(g.repo) === key ? { ...g, loadingMore: false } : g)),
        );
      }
    },
    [fetchPage],
  );

  return {
    groups,
    loading,
    error: repos.length === 0 ? "No repositories configured." : null,
    refresh,
    loadMore,
  };
}
