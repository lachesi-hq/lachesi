import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { type ChangeEventArgs, Diff, Hunk } from "react-diff-view";
import { Badge } from "@/components/ui/badge";
import { countChanges, type FileData, fileAnchorId, fileDisplayPath } from "@/lib/diff";
import { tokenizeFile } from "@/lib/highlight";
import type { DiffViewMode } from "@/types";

type RenderableDiffViewMode = Exclude<DiffViewMode, "conversation">;

const STATUS_LABEL: Record<string, string> = {
  add: "added",
  delete: "removed",
  modify: "modified",
  rename: "renamed",
  copy: "copied",
};

export interface FileDiffProps {
  file: FileData;
  viewType: RenderableDiffViewMode;
  viewed?: boolean;
  /** changeKey → node, rendered as a full-width row under the matching line. */
  widgets?: Record<string, ReactNode>;
  /** File-level comments rendered at the top of the file (not tied to a line). */
  fileComments?: ReactNode;
  /** Called when a line gutter is clicked, to open a comment composer. */
  onGutterClick?: (file: FileData, args: ChangeEventArgs) => void;
  onToggleViewed?: (file: FileData) => void;
}

export function FileDiff({
  file,
  viewType,
  viewed = false,
  widgets,
  fileComments,
  onGutterClick,
  onToggleViewed,
}: FileDiffProps) {
  const { additions, deletions } = countChanges(file);
  // Large files start collapsed (lazy): the diff + highlighting only mount on expand.
  const [collapsed, setCollapsed] = useState(additions + deletions > 500);
  const tokens = useMemo(() => (collapsed ? undefined : tokenizeFile(file)), [file, collapsed]);
  const gutterEvents = onGutterClick
    ? { onClick: (args: ChangeEventArgs) => onGutterClick(file, args) }
    : undefined;
  const handleToggleViewed = () => {
    onToggleViewed?.(file);
    setCollapsed(!viewed);
  };

  return (
    <section id={fileAnchorId(file)} className="scroll-mt-10 border-b border-border">
      <header className="sticky top-9 z-10 flex items-center gap-2 border-b border-border bg-secondary px-3 py-1.5 text-xs">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
          aria-expanded={!collapsed}
        >
          {collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
          <span className="truncate font-mono">{fileDisplayPath(file)}</span>
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-[var(--success)]">+{additions}</span>
          <span className="text-destructive">-{deletions}</span>
          <Badge variant="muted">{STATUS_LABEL[file.type] ?? file.type}</Badge>
          {onToggleViewed && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={viewed}
                onChange={handleToggleViewed}
                className="size-3 accent-primary"
              />
              Viewed
            </label>
          )}
        </span>
      </header>
      {!collapsed && fileComments}
      {!collapsed &&
        (file.hunks.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No textual changes (binary or empty).
          </p>
        ) : (
          <Diff
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
            tokens={tokens}
            widgets={widgets}
            gutterEvents={gutterEvents}
          >
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        ))}
    </section>
  );
}
