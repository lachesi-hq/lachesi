import { ArrowsClockwise, GitBranch, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tauriCall } from "@/lib/tauri";
import type { RepositoryWorktreeState, RepositoryWorktreeStatus } from "@/types";

function statusLabel(status: RepositoryWorktreeStatus): string {
  switch (status) {
    case "clean":
      return "Clean";
    case "dirty":
      return "Dirty";
    case "missingPath":
      return "Missing path";
    case "invalidRepo":
      return "Invalid repo";
    default:
      return "Error";
  }
}

function statusVariant(status: RepositoryWorktreeStatus): "success" | "muted" | "secondary" {
  if (status === "clean") return "success";
  if (status === "dirty") return "secondary";
  return "muted";
}

function currentRef(repo: RepositoryWorktreeState): string {
  return repo.currentBranch ?? (repo.detachedHead ? `detached ${repo.detachedHead}` : "-");
}

type RepositoryAction = "checkout" | "fetch" | "pull";

type RepositoryActionFeedback = {
  message: string;
  status: "running" | "success" | "error";
};

type RepositoryActionState = {
  checkoutKey: string | null;
  feedbackByRepo: Record<string, RepositoryActionFeedback>;
  fetchKey: string | null;
  pullKey: string | null;
};

const initialRepositoryActionState: RepositoryActionState = {
  checkoutKey: null,
  feedbackByRepo: {},
  fetchKey: null,
  pullKey: null,
};

type RepositoryBranchesState = RepositoryActionState & {
  error: string | null;
  loading: boolean;
  repos: RepositoryWorktreeState[];
  selectedBranches: Record<string, string>;
};

type RepositoryBranchesAction =
  | { type: "load:start" }
  | { error: string; type: "load:error" }
  | { repos: RepositoryWorktreeState[]; type: "load:success" }
  | { branchRef: string; key: string; type: "selectBranch" }
  | {
      action: RepositoryAction;
      key: string;
      message?: string;
      status: RepositoryActionFeedback["status"];
      type: "repoAction:update";
    }
  | { repo: RepositoryWorktreeState; selectedBranch?: string; type: "repo:update" };

const initialState: RepositoryBranchesState = {
  ...initialRepositoryActionState,
  error: null,
  loading: false,
  repos: [],
  selectedBranches: {},
};

function repositoryBranchesReducer(
  state: RepositoryBranchesState,
  action: RepositoryBranchesAction,
): RepositoryBranchesState {
  switch (action.type) {
    case "load:start":
      return {
        ...state,
        ...initialRepositoryActionState,
        error: null,
        loading: true,
      };
    case "load:success": {
      const selectedBranches = { ...state.selectedBranches };
      for (const repo of action.repos) {
        const key = `${repo.workspace}/${repo.repo}`;
        if (!selectedBranches[key]) {
          selectedBranches[key] = repo.currentBranch ?? repo.branches[0]?.reference ?? "";
        }
      }
      return {
        ...state,
        loading: false,
        repos: action.repos,
        selectedBranches,
      };
    }
    case "load:error":
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    case "selectBranch":
      return {
        ...state,
        selectedBranches: {
          ...state.selectedBranches,
          [action.key]: action.branchRef,
        },
      };
    case "repo:update": {
      const key = `${action.repo.workspace}/${action.repo.repo}`;
      return {
        ...state,
        repos: state.repos.map((repo) =>
          repo.workspace === action.repo.workspace && repo.repo === action.repo.repo
            ? action.repo
            : repo,
        ),
        selectedBranches: {
          ...state.selectedBranches,
          [key]:
            action.repo.currentBranch ??
            action.selectedBranch ??
            state.selectedBranches[key] ??
            action.repo.branches[0]?.reference ??
            "",
        },
      };
    }
    case "repoAction:update": {
      const busyKey = action.status === "running" ? action.key : null;
      return {
        ...state,
        checkoutKey: action.action === "checkout" ? busyKey : state.checkoutKey,
        error: null,
        feedbackByRepo: {
          ...state.feedbackByRepo,
          [action.key]: {
            status: action.status,
            message:
              action.message ??
              (action.status === "success"
                ? actionSuccessMessage(action.action)
                : actionRunningMessage(action.action)),
          },
        },
        fetchKey: action.action === "fetch" ? busyKey : state.fetchKey,
        pullKey: action.action === "pull" ? busyKey : state.pullKey,
      };
    }
    default:
      return state;
  }
}

function actionRunningMessage(action: RepositoryAction): string {
  switch (action) {
    case "checkout":
      return "Checking out branch...";
    case "fetch":
      return "Fetching from remote...";
    case "pull":
      return "Pulling latest changes...";
    default:
      return "Working...";
  }
}

function actionSuccessMessage(action: RepositoryAction): string {
  switch (action) {
    case "checkout":
      return "Checkout completed.";
    case "fetch":
      return "Fetch completed.";
    case "pull":
      return "Pull completed.";
    default:
      return "Completed.";
  }
}

export function RepositoryBranchesPanel() {
  const [state, dispatch] = useReducer(repositoryBranchesReducer, initialState);
  const {
    checkoutKey,
    error,
    feedbackByRepo,
    fetchKey,
    loading,
    pullKey,
    repos,
    selectedBranches,
  } = state;

  const updateRepoActionState = (
    key: string,
    action: RepositoryAction,
    status: RepositoryActionFeedback["status"],
    message?: string,
  ) => {
    dispatch({ action, key, message, status, type: "repoAction:update" });
  };

  const load = useCallback(async () => {
    dispatch({ type: "load:start" });
    try {
      const next = await tauriCall<RepositoryWorktreeState[]>("list_repository_worktrees");
      dispatch({ repos: next, type: "load:success" });
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : String(err), type: "load:error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkout = async (repo: RepositoryWorktreeState) => {
    const key = `${repo.workspace}/${repo.repo}`;
    const branchRef = selectedBranches[key];
    if (!branchRef) return;
    updateRepoActionState(key, "checkout", "running");
    try {
      const updated = await tauriCall<RepositoryWorktreeState>("checkout_repository_branch", {
        workspace: repo.workspace,
        repo: repo.repo,
        branchRef,
      });
      dispatch({ repo: updated, selectedBranch: branchRef, type: "repo:update" });
      updateRepoActionState(key, "checkout", "success");
    } catch (err) {
      updateRepoActionState(
        key,
        "checkout",
        "error",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const replaceRepo = (updated: RepositoryWorktreeState) => {
    dispatch({ repo: updated, type: "repo:update" });
  };

  const runRepoAction = async (
    repo: RepositoryWorktreeState,
    command: "fetch_repository" | "pull_repository",
  ) => {
    const key = `${repo.workspace}/${repo.repo}`;
    const action = command === "fetch_repository" ? "fetch" : "pull";
    updateRepoActionState(key, action, "running");
    try {
      const updated = await tauriCall<RepositoryWorktreeState>(command, {
        workspace: repo.workspace,
        repo: repo.repo,
      });
      replaceRepo(updated);
      updateRepoActionState(key, action, "success");
    } catch (err) {
      updateRepoActionState(key, action, "error", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <GitBranch size={18} className="text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Repositories</h2>
          <p className="text-xs text-muted-foreground">
            Local branches for repositories configured in Settings.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          <ArrowsClockwise size={14} className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <WarningCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Current</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Checkout</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {repos.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>
                    {loading ? "Loading repositories..." : "No repositories configured."}
                  </td>
                </tr>
              ) : (
                repos.map((repo) => {
                  const key = `${repo.workspace}/${repo.repo}`;
                  const actionBusy = checkoutKey === key || fetchKey === key || pullKey === key;
                  const canCheckout =
                    repo.status === "clean" && repo.branches.length > 0 && !actionBusy;
                  const canFetch =
                    (repo.status === "clean" || repo.status === "dirty") && !actionBusy;
                  const canPull = repo.status === "clean" && !actionBusy;
                  const feedback = feedbackByRepo[key];
                  return (
                    <tr key={key} className="border-t border-border">
                      <td className="max-w-[220px] px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="truncate font-medium">{key}</div>
                          {feedback && (
                            <span
                              className={
                                feedback.status === "error"
                                  ? "line-clamp-2 text-xs text-destructive"
                                  : feedback.status === "success"
                                    ? "text-xs text-[var(--success)]"
                                    : "text-xs text-primary"
                              }
                            >
                              {feedback.message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[360px] px-3 py-3">
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {repo.localPath ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{currentRef(repo)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={statusVariant(repo.status)}>
                            {statusLabel(repo.status)}
                          </Badge>
                          {repo.error && (
                            <span className="max-w-[260px] text-xs text-muted-foreground">
                              {repo.error}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className="h-8 w-full min-w-[190px] rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50"
                          value={selectedBranches[key] ?? ""}
                          disabled={repo.branches.length === 0 || actionBusy}
                          onChange={(event) =>
                            dispatch({
                              branchRef: event.target.value,
                              key,
                              type: "selectBranch",
                            })
                          }
                        >
                          {repo.branches.length === 0 ? (
                            <option value="">No branches</option>
                          ) : (
                            repo.branches.map((branch) => (
                              <option key={branch.reference} value={branch.reference}>
                                {branch.reference}
                              </option>
                            ))
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canFetch}
                            onClick={() => void runRepoAction(repo, "fetch_repository")}
                          >
                            {fetchKey === key ? "Fetching..." : "Fetch"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canPull}
                            onClick={() => void runRepoAction(repo, "pull_repository")}
                            title={
                              repo.dirty
                                ? "Commit, stash, or discard local changes before pull"
                                : undefined
                            }
                          >
                            {pullKey === key ? "Pulling..." : "Pull"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!canCheckout}
                            onClick={() => void checkout(repo)}
                            title={
                              repo.dirty
                                ? "Commit, stash, or discard local changes before checkout"
                                : undefined
                            }
                          >
                            {checkoutKey === key ? "Checking out..." : "Checkout"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
