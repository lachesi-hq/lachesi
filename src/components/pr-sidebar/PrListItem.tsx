import { ChatCircle, GitBranch } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PullRequestSummary } from "@/types";

export interface PrListItemProps {
  pr: PullRequestSummary;
  active: boolean;
  onSelect: (pr: PullRequestSummary) => void;
}

export function PrListItem({ pr, active, onSelect }: PrListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(pr)}
      aria-current={active}
      className={cn(
        "flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">#{pr.id}</span>
        {pr.draft && (
          <Badge variant="muted" className="shrink-0">
            Draft
          </Badge>
        )}
        <span
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            active ? "text-accent-foreground" : "text-foreground",
          )}
        >
          {pr.title}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="truncate">{pr.authorDisplayName}</span>
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          {pr.sourceBranch}
        </span>
        {pr.commentCount > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <ChatCircle size={12} />
            {pr.commentCount}
          </span>
        )}
      </div>
    </button>
  );
}
