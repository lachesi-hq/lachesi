import {
  ClockCounterClockwise,
  FileMagnifyingGlass,
  GitBranch,
  GitPullRequest,
  Rows,
  Sparkle,
} from "@phosphor-icons/react";

export type AppPaneId =
  | "pullRequests"
  | "repositories"
  | "reviewHistory"
  | "repositoryExplorer"
  | "details"
  | "aiReview";

export interface BottomPaneBarProps {
  panes: Record<AppPaneId, boolean>;
  disabled?: Partial<Record<AppPaneId, boolean>>;
  status?: string;
  onTogglePane: (pane: AppPaneId) => void;
}

const PANE_CONFIG: Array<{
  id: AppPaneId;
  label: string;
  Icon: typeof GitPullRequest;
  group: "left" | "right";
}> = [
  { id: "pullRequests", label: "Pull requests", Icon: GitPullRequest, group: "left" },
  { id: "repositories", label: "Repositories", Icon: GitBranch, group: "left" },
  { id: "reviewHistory", label: "Review history", Icon: ClockCounterClockwise, group: "left" },
  {
    id: "repositoryExplorer",
    label: "Repository explorer",
    Icon: FileMagnifyingGlass,
    group: "left",
  },
  { id: "details", label: "Details", Icon: Rows, group: "left" },
  { id: "aiReview", label: "AI review", Icon: Sparkle, group: "right" },
];

export function BottomPaneBar({ panes, disabled, status, onTogglePane }: BottomPaneBarProps) {
  const leftPanes = PANE_CONFIG.filter((pane) => pane.group === "left");
  const rightPanes = PANE_CONFIG.filter((pane) => pane.group === "right");

  return (
    <footer className="bottom-toolbar">
      <div className="toolbar-group">
        {leftPanes.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="toolbar-toggle toolbar-toggle--icon"
            data-active={panes[id] ? "true" : "false"}
            aria-pressed={panes[id]}
            disabled={disabled?.[id]}
            onClick={() => onTogglePane(id)}
            aria-label={label}
            title={label}
          >
            <Icon className="toolbar-icon" size={16} weight="regular" aria-hidden="true" />
            <span className="toolbar-tooltip" role="tooltip">
              {label}
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar-status">{status ?? ""}</div>
      <div className="toolbar-group">
        {rightPanes.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="toolbar-toggle toolbar-toggle--icon"
            data-active={panes[id] ? "true" : "false"}
            aria-pressed={panes[id]}
            disabled={disabled?.[id]}
            onClick={() => onTogglePane(id)}
            aria-label={label}
            title={label}
          >
            <Icon className="toolbar-icon" size={16} weight="regular" aria-hidden="true" />
            <span className="toolbar-tooltip" role="tooltip">
              {label}
            </span>
          </button>
        ))}
      </div>
    </footer>
  );
}
