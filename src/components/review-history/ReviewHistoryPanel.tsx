import {
  ArrowsClockwise,
  ClockCounterClockwise,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tauriCall } from "@/lib/tauri";
import type { AiReviewJob, AiReviewJobStatus } from "@/types";

export interface ReviewHistoryPanelProps {
  onSelectJob: (job: AiReviewJob) => void;
}

interface ReviewHistoryState {
  jobs: AiReviewJob[];
  query: string;
  status: AiReviewJobStatus | "all";
  loading: boolean;
  cancelingJobId: string | null;
  error: string | null;
}

type ReviewHistoryAction =
  | { type: "loadStart" }
  | { type: "loadSuccess"; jobs: AiReviewJob[] }
  | { type: "loadError"; error: string }
  | { type: "setQuery"; query: string }
  | { type: "setStatus"; status: AiReviewJobStatus | "all" }
  | { type: "cancelStart"; jobId: string }
  | { type: "cancelSuccess"; job: AiReviewJob }
  | { type: "cancelError"; error: string };

const INITIAL_STATE: ReviewHistoryState = {
  jobs: [],
  query: "",
  status: "all",
  loading: false,
  cancelingJobId: null,
  error: null,
};

const STATUS_OPTIONS: Array<{ value: AiReviewJobStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status: AiReviewJobStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function statusClassName(status: AiReviewJobStatus): string {
  switch (status) {
    case "succeeded":
      return "";
    case "running":
      return "border-primary/30 bg-primary/10 text-primary";
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "cancelled":
      return "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]";
    case "queued":
      return "";
  }
}

function statusVariant(status: AiReviewJobStatus): "success" | "secondary" | "muted" | "outline" {
  if (status === "succeeded") return "success";
  if (status === "queued") return "muted";
  if (status === "running") return "outline";
  return "secondary";
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = new Date(trimmed).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDate(value: string | null): string {
  const ms = timestampMs(value);
  if (ms == null) return "-";
  const date = new Date(ms);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationLabel(job: AiReviewJob): string {
  const start = timestampMs(job.startedAt) ?? timestampMs(job.createdAt);
  const end = timestampMs(job.finishedAt) ?? Date.now();
  if (start == null || end < start) return "-";
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest > 0 ? `${hours}h ${minuteRest}m` : `${hours}h`;
}

function jobMatches(job: AiReviewJob, query: string, status: AiReviewJobStatus | "all"): boolean {
  if (status !== "all" && job.status !== status) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    job.workspace,
    job.repo,
    `#${job.prId}`,
    String(job.prId),
    job.prTitle,
    job.sourceBranch,
    job.destinationBranch,
    job.trigger,
    job.error ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

function reviewHistoryReducer(
  state: ReviewHistoryState,
  action: ReviewHistoryAction,
): ReviewHistoryState {
  switch (action.type) {
    case "loadStart":
      return { ...state, loading: true, error: null };
    case "loadSuccess":
      return { ...state, jobs: action.jobs, loading: false, error: null };
    case "loadError":
      return { ...state, loading: false, error: action.error };
    case "setQuery":
      return { ...state, query: action.query };
    case "setStatus":
      return { ...state, status: action.status };
    case "cancelStart":
      return { ...state, cancelingJobId: action.jobId, error: null };
    case "cancelSuccess":
      return {
        ...state,
        cancelingJobId: null,
        jobs: state.jobs.map((job) => (job.id === action.job.id ? action.job : job)),
      };
    case "cancelError":
      return { ...state, cancelingJobId: null, error: action.error };
  }
}

export function ReviewHistoryPanel({ onSelectJob }: ReviewHistoryPanelProps) {
  const [state, dispatch] = useReducer(reviewHistoryReducer, INITIAL_STATE);
  const { jobs, query, status, loading, cancelingJobId, error } = state;

  const load = useCallback(async () => {
    dispatch({ type: "loadStart" });
    try {
      const next = await tauriCall<AiReviewJob[]>("list_ai_review_jobs", { limit: 100 });
      dispatch({ type: "loadSuccess", jobs: next });
    } catch (err) {
      dispatch({ type: "loadError", error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleJobs = jobs.filter((job) => jobMatches(job, query, status));
  const runningCount = jobs.filter(
    (job) => job.status === "running" || job.status === "queued",
  ).length;

  const cancelJob = async (job: AiReviewJob) => {
    dispatch({ type: "cancelStart", jobId: job.id });
    try {
      await tauriCall("cancel_inline_review", {
        workspace: job.workspace,
        repo: job.repo,
        id: job.prId,
      });
      const updated = await tauriCall<AiReviewJob>("update_ai_review_job_status", {
        jobId: job.id,
        status: "cancelled",
        threadId: job.threadId,
        error: null,
      });
      dispatch({ type: "cancelSuccess", job: updated });
    } catch (err) {
      dispatch({
        type: "cancelError",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <ClockCounterClockwise size={18} className="text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Review history</h2>
          <p className="text-xs text-muted-foreground">
            Background AI review jobs saved in the local database.
          </p>
        </div>
        {runningCount > 0 && (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {runningCount} active
          </Badge>
        )}
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          <ArrowsClockwise size={14} className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-[260px] flex-1">
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Search review jobs"
            value={query}
            onChange={(event) => dispatch({ type: "setQuery", query: event.target.value })}
            placeholder="Search repo, PR, branch, error..."
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          aria-label="Filter review jobs by status"
          value={status}
          onChange={(event) =>
            dispatch({
              type: "setStatus",
              status: event.target.value as AiReviewJobStatus | "all",
            })
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
                <th className="px-3 py-2 font-medium">PR</th>
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Branches</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                    {loading && jobs.length === 0
                      ? "Loading review jobs..."
                      : "No review jobs match the current filters."}
                  </td>
                </tr>
              ) : (
                visibleJobs.map((job) => {
                  const repoKey = `${job.workspace}/${job.repo}`;
                  return (
                    <tr key={job.id} className="border-t border-border align-top">
                      <td className="max-w-[360px] px-3 py-3">
                        <button
                          type="button"
                          className="block max-w-full text-left text-primary hover:underline"
                          onClick={() => onSelectJob(job)}
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            #{job.prId}
                          </span>{" "}
                          <span className="font-medium">{job.prTitle}</span>
                        </button>
                        {job.threadId && (
                          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                            thread {job.threadId}
                          </div>
                        )}
                        {job.error && (
                          <div className="mt-1 max-w-[360px] text-xs text-destructive">
                            {job.error}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[240px] px-3 py-3">
                        <div className="truncate font-medium">{repoKey}</div>
                        <div className="text-xs text-muted-foreground">{job.trigger}</div>
                      </td>
                      <td className="max-w-[260px] px-3 py-3 font-mono text-xs">
                        <div className="truncate">{job.sourceBranch}</div>
                        <div className="truncate text-muted-foreground">
                          → {job.destinationBranch}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={statusVariant(job.status)}
                          className={statusClassName(job.status)}
                        >
                          {statusLabel(job.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{durationLabel(job)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(job.startedAt ?? job.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {(job.status === "running" || job.status === "queued") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={cancelingJobId === job.id}
                              onClick={() => void cancelJob(job)}
                            >
                              {cancelingJobId === job.id ? "Cancelling..." : "Cancel"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onSelectJob(job)}
                            title={
                              job.threadId
                                ? "Open the PR and show this review output"
                                : "Open the PR"
                            }
                          >
                            {job.threadId ? "Open review" : "Open PR"}
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
