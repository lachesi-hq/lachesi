import { ChatCircle, CheckCircle, Clock } from "@phosphor-icons/react";
import type * as React from "react";
import type { PullRequestSummary } from "@/types";
import { formatAge, prAgeDays } from "./prAge";

interface PrTableProps {
  pullRequests: PullRequestSummary[];
  currentUserAccountId?: string | null;
  onSelectPr: (pr: PullRequestSummary) => void;
}

function AgeBadge({ days }: { days: number }) {
  let style: React.CSSProperties;
  if (days > 7) {
    style = {
      background: "color-mix(in srgb, var(--destructive) 15%, transparent)",
      color: "var(--destructive)",
    };
  } else if (days > 3) {
    style = {
      background: "color-mix(in srgb, var(--warning) 15%, transparent)",
      color: "var(--warning)",
    };
  } else {
    style = {
      background: "color-mix(in srgb, var(--success) 15%, transparent)",
      color: "var(--success)",
    };
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={style}
    >
      {formatAge(days)}
    </span>
  );
}

function ReviewStatus({
  pr,
  currentUserAccountId,
}: {
  pr: PullRequestSummary;
  currentUserAccountId?: string | null;
}) {
  const reviewers = pr.reviewers ?? [];
  const approved = reviewers.filter((reviewer) => reviewer.approved);
  const currentUserApproved =
    currentUserAccountId != null &&
    reviewers.some((reviewer) => reviewer.accountId === currentUserAccountId && reviewer.approved);
  const currentUserReviewer =
    currentUserAccountId != null &&
    reviewers.some((reviewer) => reviewer.accountId === currentUserAccountId);

  if (currentUserApproved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-xs font-medium text-[var(--success)]">
        <CheckCircle size={13} weight="fill" />
        Approved
      </span>
    );
  }

  if (currentUserReviewer) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-xs font-medium text-[var(--warning)]">
        <Clock size={13} />
        Needs you
      </span>
    );
  }

  if (approved.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <CheckCircle size={13} />
        {approved.length}/{reviewers.length || approved.length}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock size={13} />
      Pending
    </span>
  );
}

export function PrTable({ pullRequests, currentUserAccountId, onSelectPr }: PrTableProps) {
  const sorted = [...pullRequests].sort(
    (a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No open PRs
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Title
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Author
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Repo
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Age
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Review
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
              Comments
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pr) => {
            const days = prAgeDays(pr.createdOn);
            return (
              <tr
                key={`${pr.workspace}/${pr.repo}/${pr.id}`}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                onClick={() => onSelectPr(pr)}
              >
                <td className="max-w-xs px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {pr.draft && (
                      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                        Draft
                      </span>
                    )}
                    <span className="truncate font-medium">{pr.title}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {pr.authorDisplayName}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{pr.repo}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <AgeBadge days={days} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <ReviewStatus pr={pr} currentUserAccountId={currentUserAccountId} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {pr.commentCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <ChatCircle size={13} />
                      {pr.commentCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
