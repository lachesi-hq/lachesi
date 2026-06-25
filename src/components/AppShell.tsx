import type * as React from "react";

import { cn } from "@/lib/utils";

export interface AppShellProps {
  /** When omitted the main content fills the full width (overview mode). */
  sidebar?: React.ReactNode;
  main?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  /** Sidebar width in px. */
  sidebarWidth?: number;
  /** Optional right panel shown beside the main content (e.g. AI review). */
  rightPanel?: React.ReactNode;
  /** Right panel width in px. */
  rightPanelWidth?: number;
  /**
   * When true the right panel overlays the entire body area (absolute inset-0),
   * matching the Zed "zoom panel" pattern.
   */
  rightPanelExpanded?: boolean;
}

export function AppShell({
  sidebar,
  main,
  headerRight,
  footer,
  sidebarWidth = 340,
  rightPanel,
  rightPanelWidth = 420,
  rightPanelExpanded = false,
}: AppShellProps) {
  const hasSidebar = sidebar != null;
  const hasMain = main != null;
  const hasRight = rightPanel != null;
  const showRightInGrid = hasRight && !rightPanelExpanded;

  const columns = (() => {
    if (hasSidebar && hasMain && showRightInGrid) {
      return `${sidebarWidth}px minmax(0, 1fr) ${rightPanelWidth}px`;
    }
    if (hasSidebar && hasMain) {
      return `${sidebarWidth}px minmax(0, 1fr)`;
    }
    if (hasMain && showRightInGrid) {
      return `minmax(0, 1fr) ${rightPanelWidth}px`;
    }
    if (hasSidebar && showRightInGrid) {
      return `${sidebarWidth}px minmax(0, 1fr)`;
    }
    return "minmax(0, 1fr)";
  })();

  const panes: React.ReactNode[] = [];
  if (hasSidebar) {
    panes.push(
      <div
        key="sidebar"
        className={cn(
          "min-h-0 overflow-hidden",
          (hasMain || showRightInGrid) && "border-r border-border",
        )}
      >
        {sidebar}
      </div>,
    );
  }
  if (hasMain) {
    panes.push(
      <main
        key="main"
        className={cn("min-h-0 overflow-hidden", showRightInGrid && "border-r border-border")}
      >
        {main}
      </main>,
    );
  }
  if (showRightInGrid) {
    panes.push(
      <div key="right" className="min-h-0 overflow-hidden bg-background">
        {rightPanel}
      </div>,
    );
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">Lachesi</span>
          <span className="text-xs text-muted-foreground">Bitbucket review</span>
        </div>
        <div className="flex items-center gap-1">{headerRight}</div>
      </header>
      {panes.length > 0 ? (
        <div className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns: columns }}>
          {panes}
          {hasRight && rightPanelExpanded && (
            <div
              className={cn(
                "min-h-0 overflow-hidden bg-background",
                rightPanelExpanded && "absolute inset-0 z-30 border-l-0 shadow-xl",
              )}
            >
              {rightPanel}
            </div>
          )}
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-hidden">{main}</main>
      )}
      {footer}
    </div>
  );
}
