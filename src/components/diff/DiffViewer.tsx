import "react-diff-view/style/index.css";
import "./diff-theme.css";
import { CaretDown } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import type { ChangeEventArgs } from "react-diff-view";
import { countChanges, type FileData, fileAnchorId, fileKey } from "@/lib/diff";
import type { DiffViewMode } from "@/types";
import { DiffViewToggle } from "./DiffViewToggle";
import { FileDiff } from "./FileDiff";
import { FileTree } from "./FileTree";

type RenderableDiffViewMode = Exclude<DiffViewMode, "conversation">;

export interface DiffViewerProps {
  files: FileData[];
  viewMode: RenderableDiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  loading?: boolean;
  error?: string | null;
  /** Per-file changeKey → widget map (comments / composer), keyed by fileKey. */
  widgetsByFile?: Record<string, Record<string, ReactNode>>;
  /** Per-file file-level comment block, keyed by fileKey. */
  fileWidgets?: Record<string, ReactNode>;
  viewedFileKeys?: Set<string>;
  onToggleFileViewed?: (file: FileData) => void;
  /** Called when a line gutter is clicked, to open a comment composer. */
  onGutterClick?: (file: FileData, args: ChangeEventArgs) => void;
}

export function DiffViewer({
  files,
  viewMode,
  onViewModeChange,
  loading,
  error,
  widgetsByFile,
  fileWidgets,
  viewedFileKeys,
  onToggleFileViewed,
  onGutterClick,
}: DiffViewerProps) {
  const [showFiles, setShowFiles] = useState(false);

  const scrollToFile = (file: FileData) => {
    document
      .getElementById(fileAnchorId(file))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowFiles(false);
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading diff…</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (files.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No changes in this pull request.</div>
    );
  }

  const totals = files.reduce(
    (acc, file) => {
      const { additions, deletions } = countChanges(file);
      acc.additions += additions;
      acc.deletions += deletions;
      return acc;
    },
    { additions: 0, deletions: 0 },
  );
  const viewedCount = files.filter((file) => viewedFileKeys?.has(fileKey(file))).length;

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs">
          <button
            type="button"
            onClick={() => setShowFiles((s) => !s)}
            className="flex items-center gap-1 font-medium hover:text-primary"
            aria-expanded={showFiles}
            title="Show changed files"
          >
            <CaretDown
              size={12}
              className={showFiles ? "" : "-rotate-90"}
              style={{ transition: "transform 0.15s" }}
            />
            {files.length} file{files.length === 1 ? "" : "s"} changed
          </button>
          <span className="text-[var(--success)]">+{totals.additions}</span>
          <span className="text-destructive">-{totals.deletions}</span>
          {viewedFileKeys && (
            <span className="ml-2 text-muted-foreground">
              {viewedCount} / {files.length} viewed
            </span>
          )}
          <div className="ml-auto">
            <DiffViewToggle value={viewMode} onChange={onViewModeChange} />
          </div>
        </div>
        {showFiles && (
          <FileTree
            files={files}
            viewedFileKeys={viewedFileKeys}
            onSelect={scrollToFile}
            onToggleViewed={onToggleFileViewed}
          />
        )}
      </div>
      <div>
        {files.map((file) => (
          <FileDiff
            key={fileKey(file)}
            file={file}
            viewType={viewMode}
            viewed={viewedFileKeys?.has(fileKey(file)) ?? false}
            widgets={widgetsByFile?.[fileKey(file)]}
            fileComments={fileWidgets?.[fileKey(file)]}
            onGutterClick={onGutterClick}
            onToggleViewed={onToggleFileViewed}
          />
        ))}
      </div>
    </div>
  );
}
