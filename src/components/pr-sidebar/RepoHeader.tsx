import { ArrowsClockwise, CaretDoubleDown, CaretDoubleUp, ChartBar, GearSix } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export interface RepoHeaderProps {
  repoCount: number;
  refreshing?: boolean;
  /** When provided, shows a collapse-all / expand-all toggle. */
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenOverview?: () => void;
}

export function RepoHeader({
  repoCount,
  refreshing,
  onToggleCollapseAll,
  allCollapsed,
  onRefresh,
  onOpenSettings,
  onOpenOverview,
}: RepoHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Pull requests</div>
        <div className="truncate text-xs text-muted-foreground">
          {repoCount === 0
            ? "No repositories — open settings"
            : `${repoCount} repositor${repoCount === 1 ? "y" : "ies"}`}
        </div>
      </div>
      {onOpenOverview && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenOverview}
          aria-label="Open overview dashboard"
          title="Overview"
        >
          <ChartBar size={16} />
        </Button>
      )}
      {onToggleCollapseAll && repoCount > 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapseAll}
          aria-label={allCollapsed ? "Expand all repositories" : "Collapse all repositories"}
          title={allCollapsed ? "Expand all" : "Collapse all"}
        >
          {allCollapsed ? <CaretDoubleDown size={16} /> : <CaretDoubleUp size={16} />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        aria-label="Refresh pull requests"
        title="Refresh"
      >
        <ArrowsClockwise size={16} className={refreshing ? "animate-spin" : undefined} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <GearSix size={16} />
      </Button>
    </div>
  );
}
