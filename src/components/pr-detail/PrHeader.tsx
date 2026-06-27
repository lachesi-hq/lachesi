import {
  ArrowDown,
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowUp,
  CheckCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { jiraBrowseUrl } from "@/lib/jira";
import { openExternal } from "@/lib/tauri";
import type { BranchStatus, PullRequestDetail } from "@/types";

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
  const metadataItems = [
    ...(jiraKeys ?? []).map((key) => ({ id: `jira:${key}`, label: key, isJiraKey: true })),
    { id: "sourceBranch", label: pr.sourceBranch, isJiraKey: false },
    { id: "destinationBranch", label: pr.destinationBranch, isJiraKey: false },
  ];

  return (
    <header className="border-b border-border bg-secondary px-3 pb-5 pt-2.5">
      <div className="flex items-start gap-3">
        <h1 className="flex-1 text-[22px] font-bold leading-7">
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
          <span className="font-mono text-sm font-medium text-muted-foreground">#{pr.id}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {pr.draft && <Badge variant="muted">Draft</Badge>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] leading-[18px] text-muted-foreground">
        <Avatar name={pr.authorDisplayName} size="md" />
        <span>•</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {metadataItems.map((item, index) => {
            const content =
              item.isJiraKey && jiraBaseUrl ? (
                <button
                  type="button"
                  onClick={() => openExternal(jiraBrowseUrl(jiraBaseUrl, item.label))}
                  className="hover:text-foreground"
                  title={`Open ${item.label} on Jira`}
                >
                  {item.label}
                </button>
              ) : (
                <span>{item.label}</span>
              );
            return (
              <span key={item.id} className="inline-flex items-center gap-1.5">
                {index > 0 && <span>•</span>}
                {content}
              </span>
            );
          })}
        </span>
        <span title={absolute(pr.createdOn)}>opened {formatRelative(pr.createdOn)}</span>
        <span>•</span>
        <span title={absolute(pr.updatedOn)}>updated {formatRelative(pr.updatedOn)}</span>
        <span>•</span>
        {branchStatus && branchStatus.behind > 0 && (
          <span
            className="flex items-center gap-1 text-[var(--warning)]"
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
            className="h-8 rounded-full border border-border bg-secondary px-2.5 text-xs font-semibold hover:bg-muted"
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
            className="flex items-center gap-1"
            title={`${commitsLabel(branchStatus.ahead, branchStatus.aheadCapped)} commit(s) ahead of ${pr.destinationBranch}`}
          >
            <ArrowUp size={12} />
            {commitsLabel(branchStatus.ahead, branchStatus.aheadCapped)} ahead
          </span>
        )}
      </div>

      {pr.reviewers.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] leading-[18px]">
          <span className="text-muted-foreground">Reviewers:</span>
          {pr.reviewers.map((r, index) => (
            <span
              key={r.accountId ?? r.displayName}
              className="flex items-center gap-2"
              title={r.displayName}
            >
              {index > 0 && <span className="text-muted-foreground">•</span>}
              {r.approved && (
                <CheckCircle size={12} weight="fill" className="text-[var(--success)]" />
              )}
              <Avatar name={r.displayName} size="md" />
            </span>
          ))}
        </div>
      )}

      {pr.descriptionRaw.trim() && (
        <Markdown className="mt-4 max-w-3xl">{pr.descriptionRaw}</Markdown>
      )}
    </header>
  );
}
