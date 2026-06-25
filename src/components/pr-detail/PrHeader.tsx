import {
  ArrowDown,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  GitBranch,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { jiraBrowseUrl } from "@/lib/jira";
import { openExternal } from "@/lib/tauri";
import type { BranchStatus, PrState, PullRequestDetail } from "@/types";

const STATE_VARIANT: Record<PrState, BadgeProps["variant"]> = {
  OPEN: "success",
  MERGED: "default",
  DECLINED: "secondary",
  SUPERSEDED: "muted",
};

function absolute(iso: string): string {
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? iso : new Date(ts).toLocaleString();
}

export interface PrHeaderProps {
  pr: PullRequestDetail;
  /** Bitbucket web URL; when set, the title links out to it. */
  htmlUrl?: string | null;
  /** How far the source branch is behind/ahead of the destination. */
  branchStatus?: BranchStatus | null;
  /** Jira issue keys from the branch/title. */
  jiraKeys?: string[];
  /** Jira site base URL; when set, the keys link out to Jira. */
  jiraBaseUrl?: string | null;
  /** Sync the source branch with the destination branch. */
  onSyncBranch?: () => void;
  /** True while branch sync is running. */
  syncBusy?: boolean;
  /** Action controls rendered in the header (e.g. review actions). */
  actions?: ReactNode;
}

function commitsLabel(count: number, capped: boolean): string {
  return capped ? `${count}+` : `${count}`;
}

export function PrHeader({
  pr,
  htmlUrl,
  branchStatus,
  jiraKeys,
  jiraBaseUrl,
  onSyncBranch,
  syncBusy = false,
  actions,
}: PrHeaderProps) {
  return (
    <header className="border-b border-border px-6 py-4">
      <div className="flex items-start gap-3">
        <h1 className="flex-1 text-lg font-semibold leading-snug">
          {htmlUrl ? (
            <button
              type="button"
              onClick={() => openExternal(htmlUrl)}
              className="group text-left hover:text-primary"
              title="Open on Bitbucket"
            >
              {pr.title}
              <ArrowSquareOut
                size={14}
                className="ml-1 inline opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          ) : (
            pr.title
          )}{" "}
          <span className="font-mono font-normal text-muted-foreground">#{pr.id}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {pr.draft && <Badge variant="muted">Draft</Badge>}
          <Badge variant={STATE_VARIANT[pr.state]}>{pr.state}</Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{pr.authorDisplayName}</span>
        {jiraKeys?.map((key) =>
          jiraBaseUrl ? (
            <button
              key={key}
              type="button"
              onClick={() => openExternal(jiraBrowseUrl(jiraBaseUrl, key))}
              title={`Open ${key} on Jira`}
            >
              <Badge variant="secondary">{key}</Badge>
            </button>
          ) : (
            <Badge key={key} variant="secondary">
              {key}
            </Badge>
          ),
        )}
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          <code className="rounded bg-muted px-1 py-0.5">{pr.sourceBranch}</code>
          <ArrowRight size={12} />
          <code className="rounded bg-muted px-1 py-0.5">{pr.destinationBranch}</code>
        </span>
        <span title={absolute(pr.createdOn)}>opened {formatRelative(pr.createdOn)}</span>
        <span title={absolute(pr.updatedOn)}>updated {formatRelative(pr.updatedOn)}</span>
        {branchStatus && branchStatus.behind > 0 && (
          <span
            className="flex items-center gap-0.5 text-[var(--warning)]"
            title={`${commitsLabel(branchStatus.behind, branchStatus.behindCapped)} commit(s) behind ${pr.destinationBranch}`}
          >
            <ArrowDown size={12} />
            {commitsLabel(branchStatus.behind, branchStatus.behindCapped)} behind
          </span>
        )}
        {branchStatus && branchStatus.behind > 0 && onSyncBranch && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={onSyncBranch}
            disabled={syncBusy}
            title={`Merge ${pr.destinationBranch} into ${pr.sourceBranch} and push the synced branch`}
          >
            {syncBusy ? (
              <CircleNotch size={12} className="animate-spin" />
            ) : (
              <ArrowsClockwise size={12} />
            )}
            {syncBusy ? "Syncing…" : "Sync branch"}
          </Button>
        )}
        {branchStatus && branchStatus.ahead > 0 && (
          <span
            className="flex items-center gap-0.5"
            title={`${commitsLabel(branchStatus.ahead, branchStatus.aheadCapped)} commit(s) ahead of ${pr.destinationBranch}`}
          >
            <ArrowUp size={12} />
            {commitsLabel(branchStatus.ahead, branchStatus.aheadCapped)} ahead
          </span>
        )}
      </div>

      {pr.reviewers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Reviewers:</span>
          {pr.reviewers.map((r) => (
            <span key={r.displayName} className="flex items-center gap-1">
              {r.approved && (
                <CheckCircle size={12} weight="fill" className="text-[var(--success)]" />
              )}
              {r.displayName}
            </span>
          ))}
        </div>
      )}

      {pr.descriptionRaw.trim() && (
        <Markdown className="mt-3 max-w-3xl">{pr.descriptionRaw}</Markdown>
      )}
    </header>
  );
}
