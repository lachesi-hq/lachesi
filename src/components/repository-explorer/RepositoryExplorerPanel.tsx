import {
  ArrowDown,
  ArrowSquareOut,
  ArrowUp,
  CaretDown,
  CaretRight,
  File,
  Folder,
  FolderOpen,
  ListBullets,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown, markdownHeadingId, markdownHeadingSlug } from "@/components/Markdown";
import { type HighlightNode, highlightCode } from "@/lib/highlight";
import {
  getRepositoryFileBlame,
  getRepositoryFileDiff,
  listRepositoryFiles,
  openRepositoryFileExternal,
  readRepositoryFile,
} from "@/lib/localRepoService";
import { cn } from "@/lib/utils";
import type {
  RepositoryBlameLine,
  RepositoryFileContent,
  RepositoryFileDiff,
  RepositoryFileEntry,
  RepositoryFileStatus,
} from "@/types";

type DirectoryNode = {
  type: "directory";
  name: string;
  path: string;
  children: TreeNode[];
  childMap: Map<string, TreeNode>;
};

type FileNode = {
  type: "file";
  name: string;
  path: string;
  file: RepositoryFileEntry;
};

type TreeNode = DirectoryNode | FileNode;

type BlameCacheEntry =
  | { status: "loading"; lines: RepositoryBlameLine[]; error: null }
  | { status: "ready"; lines: RepositoryBlameLine[]; error: null }
  | { status: "failed"; lines: RepositoryBlameLine[]; error: string };

type FileDiffState =
  | { status: "idle"; diff: null; error: null }
  | { status: "loading"; diff: null; error: null }
  | { status: "ready"; diff: RepositoryFileDiff; error: null }
  | { status: "failed"; diff: null; error: string };

type RepositoryViewerMode = "file" | "diff";
type MarkdownViewerMode = "source" | "rendered";

type MarkdownHeading = {
  id: string;
  level: number;
  text: string;
};

type FindMatch = {
  id: string;
  lineIndex: number;
  start: number;
  end: number;
};

type LineFindMatch = FindMatch & {
  active: boolean;
};

export interface RepositoryExplorerPanelProps {
  workspace: string | null;
  repo: string | null;
  initialPath?: string | null;
  initialLine?: number | null;
  onSelectFile?: (path: string, line?: number | null) => void;
}

function createDirectory(name: string, path: string): DirectoryNode {
  return { type: "directory", name, path, children: [], childMap: new Map() };
}

function buildTree(files: RepositoryFileEntry[]): TreeNode[] {
  const root = createDirectory("", "");

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const fileName = parts.pop() ?? file.path;
    let parent = root;

    for (const part of parts) {
      const directoryPath = parent.path ? `${parent.path}/${part}` : part;
      const existing = parent.childMap.get(part);
      if (existing?.type === "directory") {
        parent = existing;
        continue;
      }

      const directory = createDirectory(part, directoryPath);
      parent.childMap.set(part, directory);
      parent.children.push(directory);
      parent = directory;
    }

    const fileNode: FileNode = { type: "file", name: fileName, path: file.path, file };
    parent.childMap.set(fileName, fileNode);
    parent.children.push(fileNode);
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === "directory") sortNodes(node.children);
    }
  };

  sortNodes(root.children);
  return root.children;
}

function directoryPaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type !== "directory") return [];
    return [node.path, ...directoryPaths(node.children)];
  });
}

function renderHighlightedNodes(nodes: HighlightNode[], keyPrefix: string): React.ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.value ?? "";
    if (node.type !== "element") return null;
    const className = node.properties?.className;
    const classValue = Array.isArray(className) ? className.join(" ") : className;
    return (
      <span key={key} className={classValue}>
        {node.children ? renderHighlightedNodes(node.children, key) : null}
      </span>
    );
  });
}

function findTextMatches(lines: string[], query: string): FindMatch[] {
  if (query.length === 0) return [];
  const needle = query.toLowerCase();
  const matches: FindMatch[] = [];

  lines.forEach((line, lineIndex) => {
    const haystack = line.toLowerCase();
    let searchFrom = 0;
    let lineMatchIndex = 0;
    while (searchFrom <= line.length) {
      const start = haystack.indexOf(needle, searchFrom);
      if (start === -1) break;
      const end = start + query.length;
      matches.push({
        id: `${lineIndex + 1}:${lineMatchIndex + 1}:${start}`,
        lineIndex,
        start,
        end,
      });
      searchFrom = end;
      lineMatchIndex += 1;
    }
  });

  return matches;
}

function groupFindMatchesByLine(
  matches: FindMatch[],
  activeMatchId: string | null,
): Map<number, LineFindMatch[]> {
  const grouped = new Map<number, LineFindMatch[]>();
  for (const match of matches) {
    const current = grouped.get(match.lineIndex) ?? [];
    current.push({ ...match, active: match.id === activeMatchId });
    grouped.set(match.lineIndex, current);
  }
  return grouped;
}

function renderTextWithFindHighlights(
  text: string,
  matches: LineFindMatch[],
  keyPrefix: string,
): React.ReactNode {
  if (matches.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(
        <span key={`${keyPrefix}:text:${cursor}:${match.start}`}>
          {text.slice(cursor, match.start)}
        </span>,
      );
    }
    nodes.push(
      <mark
        key={`${keyPrefix}:match:${match.id}`}
        className={cn("repo-find-match", match.active && "repo-find-match--active")}
        data-find-current={match.active ? "true" : undefined}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  }

  if (cursor < text.length) {
    nodes.push(<span key={`${keyPrefix}:text:${cursor}:end`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isMarkdownPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /\.(md|markdown)$/i.test(path);
}

function markdownHeadingText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();
}

function parseMarkdownHeadings(markdown: string, idPrefix: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = markdownHeadingText(match[2] ?? "");
    if (!text) continue;

    const slug = markdownHeadingSlug(text);
    const occurrence = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, occurrence);
    headings.push({
      id: markdownHeadingId(idPrefix, text, occurrence),
      level: match[1]?.length ?? 1,
      text,
    });
  }

  return headings;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isChangedFileStatus(status: RepositoryFileStatus): boolean {
  return status !== "unchanged";
}

function fileStatusLabel(status: RepositoryFileStatus): string | null {
  switch (status) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "U";
    case "conflicted":
      return "!";
    case "unchanged":
      return null;
  }
}

function fileStatusTitle(status: RepositoryFileStatus): string {
  switch (status) {
    case "modified":
      return "Modified";
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "untracked":
      return "Untracked";
    case "conflicted":
      return "Conflicted";
    case "unchanged":
      return "Unchanged";
  }
}

function fileStatusClassName(status: RepositoryFileStatus): string {
  switch (status) {
    case "modified":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "added":
    case "untracked":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "deleted":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "renamed":
      return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    case "conflicted":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "unchanged":
      return "";
  }
}

function DiffLine({ line, findMatches }: { line: string; findMatches: LineFindMatch[] }) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDelete = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");
  const isMeta =
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("---") ||
    line.startsWith("+++") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to");

  return (
    <div
      className={cn(
        "repo-diff-line",
        isAdd && "repo-diff-line--add",
        isDelete && "repo-diff-line--delete",
        isHunk && "repo-diff-line--hunk",
        isMeta && "repo-diff-line--meta",
      )}
    >
      <span className="repo-diff-prefix">{isAdd ? "+" : isDelete ? "-" : isHunk ? "@" : " "}</span>
      <code className="repo-diff-content">
        {renderTextWithFindHighlights(line, findMatches, `diff:${line}`)}
      </code>
    </div>
  );
}

function RepositoryDiffViewer({
  diffState,
  findMatchesByLine,
  activeFindMatchId,
}: {
  diffState: FileDiffState;
  findMatchesByLine: Map<number, LineFindMatch[]>;
  activeFindMatchId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeFindMatchId || !scrollRef.current) return;
    const target = scrollRef.current.querySelector('[data-find-current="true"]');
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [activeFindMatchId]);

  if (diffState.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        Loading diff...
      </div>
    );
  }
  if (diffState.status === "failed") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        {diffState.error}
      </div>
    );
  }
  if (diffState.status !== "ready" || !diffState.diff.rawDiff.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No local diff for this file.
      </div>
    );
  }

  const lineOccurrences = new Map<string, number>();

  return (
    <div ref={scrollRef} className="repo-code-viewer min-h-0 flex-1 overflow-auto">
      <div className="min-w-max py-2">
        {diffState.diff.rawDiff.split("\n").map((line, lineIndex) => {
          const occurrence = (lineOccurrences.get(line) ?? 0) + 1;
          lineOccurrences.set(line, occurrence);

          return (
            <DiffLine
              key={`${line}:${occurrence}`}
              line={line}
              findMatches={findMatchesByLine.get(lineIndex) ?? []}
            />
          );
        })}
      </div>
    </div>
  );
}

function formatBlameTime(authorTime: number | null): string | null {
  if (authorTime == null) return null;
  return new Date(authorTime * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bitbucketCommitUrl(workspace: string, repo: string, sha: string): string {
  return `https://bitbucket.org/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`;
}

function isRealCommitSha(sha: string): boolean {
  return !/^0+$/.test(sha);
}

interface RepositoryTreeRowsProps {
  nodes: TreeNode[];
  level: number;
  activePath: string | null;
  collapsedDirectories: Set<string>;
  onSelectFile: (file: RepositoryFileEntry) => void;
  onToggleDirectory: (path: string) => void;
}

function RepositoryTreeRows({
  nodes,
  level,
  activePath,
  collapsedDirectories,
  onSelectFile,
  onToggleDirectory,
}: RepositoryTreeRowsProps) {
  return (
    <ul className={level === 0 ? "" : "mt-0.5"}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = collapsedDirectories.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                className="flex h-7 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                style={{ paddingLeft: 12 + level * 16 }}
                aria-expanded={!collapsed}
              >
                {collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
                {collapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                <span className="truncate font-medium">{node.name}</span>
              </button>
              {!collapsed && (
                <RepositoryTreeRows
                  nodes={node.children}
                  level={level + 1}
                  activePath={activePath}
                  collapsedDirectories={collapsedDirectories}
                  onSelectFile={onSelectFile}
                  onToggleDirectory={onToggleDirectory}
                />
              )}
            </li>
          );
        }

        const active = node.path === activePath;
        const statusLabel = fileStatusLabel(node.file.status);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelectFile(node.file)}
              className={cn(
                "flex h-7 w-full items-center gap-2 px-3 text-left text-xs hover:bg-muted",
                active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
              )}
              style={{ paddingLeft: 12 + level * 16 }}
              aria-current={active ? "true" : undefined}
            >
              <File size={13} className="shrink-0" />
              <span className="truncate font-mono">{node.name}</span>
              {statusLabel && (
                <span
                  className={cn(
                    "ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 text-[10px] font-semibold leading-none",
                    fileStatusClassName(node.file.status),
                  )}
                  title={fileStatusTitle(node.file.status)}
                >
                  {statusLabel}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RepositoryCodeViewer({
  file,
  workspace,
  repo,
  selectedLine,
  selectedBlame,
  blameLoading,
  blameError,
  findMatchesByLine,
  activeFindMatchId,
  onSelectLine,
}: {
  file: RepositoryFileContent | null;
  workspace: string;
  repo: string;
  selectedLine: number | null;
  selectedBlame: RepositoryBlameLine | null;
  blameLoading: boolean;
  blameError: string | null;
  findMatchesByLine: Map<number, LineFindMatch[]>;
  activeFindMatchId: string | null;
  onSelectLine: (line: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lines = useMemo(() => file?.content.split("\n") ?? [], [file]);
  const highlightedLines = useMemo(() => {
    if (!file) return [];
    return lines.map((line) => highlightCode(file.path, line));
  }, [file, lines]);
  const filePath = file?.path ?? null;

  useEffect(() => {
    if (!filePath || !selectedLine || !scrollRef.current) return;
    const target = scrollRef.current.querySelector(`[data-line="${selectedLine}"]`);
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [filePath, selectedLine]);

  useEffect(() => {
    if (!activeFindMatchId || !scrollRef.current) return;
    const target = scrollRef.current.querySelector('[data-find-current="true"]');
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [activeFindMatchId]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Select a file from the repository tree.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="repo-code-viewer min-h-0 flex-1 overflow-auto">
      <div className="min-w-max py-2">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const active = selectedLine === lineNumber;
          const highlighted = highlightedLines[index];
          const blameTime = active ? formatBlameTime(selectedBlame?.authorTime ?? null) : null;
          const commitUrl =
            active && selectedBlame && isRealCommitSha(selectedBlame.sha)
              ? bitbucketCommitUrl(workspace, repo, selectedBlame.sha)
              : null;
          const commitMessage =
            selectedBlame?.message?.trim() || selectedBlame?.summary?.trim() || null;
          const findMatches = findMatchesByLine.get(index) ?? [];
          return (
            <div key={`${file.path}:${lineNumber}`} data-line={lineNumber}>
              <button
                type="button"
                className={cn("repo-code-line", active && "repo-code-line--active")}
                onClick={() => onSelectLine(lineNumber)}
                aria-label={`Select line ${lineNumber}`}
              >
                <span className="repo-code-gutter">{lineNumber}</span>
                <code className="repo-code-content">
                  {findMatches.length > 0
                    ? renderTextWithFindHighlights(line, findMatches, `${file.path}:${lineNumber}`)
                    : highlighted
                      ? renderHighlightedNodes(highlighted, `${lineNumber}`)
                      : line}
                </code>
              </button>
              {active && (
                <div className="repo-blame-popover">
                  {blameLoading ? (
                    <span className="text-muted-foreground">Loading blame...</span>
                  ) : blameError ? (
                    <span className="text-destructive">{blameError}</span>
                  ) : selectedBlame ? (
                    <div className="repo-blame-details">
                      <div className="repo-blame-meta">
                        <span className="font-medium text-foreground">
                          {selectedBlame.author ?? "Unknown author"}
                        </span>
                        {blameTime && <span>{blameTime}</span>}
                        {commitUrl ? (
                          <a
                            href={commitUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-foreground underline decoration-border underline-offset-2 hover:text-primary"
                          >
                            {selectedBlame.shortSha}
                          </a>
                        ) : (
                          <span className="font-mono">{selectedBlame.shortSha}</span>
                        )}
                      </div>
                      {commitMessage && <pre className="repo-blame-message">{commitMessage}</pre>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      No blame information for this line.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RepositoryMarkdownPreview({ file }: { file: RepositoryFileContent | null }) {
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const headingIdPrefix = useMemo(
    () => `repo-md-${markdownHeadingSlug(file?.path ?? "markdown")}`,
    [file?.path],
  );
  const headings = useMemo(
    () => (file ? parseMarkdownHeadings(file.content, headingIdPrefix) : []),
    [file, headingIdPrefix],
  );

  const handleSelectHeading = (id: string) => {
    const target = document.getElementById(id);
    const container = contentScrollRef.current;
    if (!(container instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + targetRect.top - containerRect.top - 16;

    container.scrollTop = top;
    container.scrollTo({ top, behavior: "auto" });
    requestAnimationFrame(() => {
      container.scrollTop = top;
    });
  };

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Select a file from the repository tree.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "repo-markdown-viewer min-h-0 flex-1",
        !outlineOpen && "repo-markdown-viewer--outline-collapsed",
      )}
    >
      <div ref={contentScrollRef} className="repo-markdown-content-scroll">
        <Markdown className="repo-markdown-content" headingIdPrefix={headingIdPrefix}>
          {file.content}
        </Markdown>
      </div>
      <aside className="repo-markdown-outline" aria-label="Markdown outline">
        <button
          type="button"
          className="repo-markdown-outline-toggle"
          onClick={() => setOutlineOpen((current) => !current)}
          aria-expanded={outlineOpen}
          aria-label={outlineOpen ? "Collapse headings map" : "Expand headings map"}
        >
          <ListBullets size={14} />
          <span>{outlineOpen ? "Headings" : "Map"}</span>
          {outlineOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}
        </button>
        {outlineOpen && (
          <nav className="repo-markdown-outline-list" aria-label="Markdown headings">
            {headings.length > 0 ? (
              headings.map((heading) => (
                <button
                  key={heading.id}
                  type="button"
                  className="repo-markdown-outline-item"
                  style={{ paddingLeft: 8 + Math.max(0, heading.level - 1) * 12 }}
                  onClick={() => handleSelectHeading(heading.id)}
                  title={heading.text}
                >
                  {heading.text}
                </button>
              ))
            ) : (
              <span className="repo-markdown-outline-empty">No headings</span>
            )}
          </nav>
        )}
      </aside>
    </div>
  );
}

export function RepositoryExplorerPanel({
  workspace,
  repo,
  initialPath,
  initialLine,
  onSelectFile,
}: RepositoryExplorerPanelProps) {
  const [files, setFiles] = useState<RepositoryFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath ?? null);
  const [selectedLine, setSelectedLine] = useState<number | null>(initialLine ?? null);
  const [content, setContent] = useState<RepositoryFileContent | null>(null);
  const [viewerMode, setViewerMode] = useState<RepositoryViewerMode>("file");
  const [markdownViewerMode, setMarkdownViewerMode] = useState<MarkdownViewerMode>("source");
  const [fileDiffState, setFileDiffState] = useState<FileDiffState>({
    status: "idle",
    diff: null,
    error: null,
  });
  const [filterQuery, setFilterQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [externalOpenError, setExternalOpenError] = useState<string | null>(null);
  const [openingExternalFile, setOpeningExternalFile] = useState(false);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(() => new Set());
  const [blameByPath, setBlameByPath] = useState<Record<string, BlameCacheEntry>>({});
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedFilterQuery = filterQuery.trim().toLowerCase();
  const changedFileCount = useMemo(
    () => files.filter((file) => isChangedFileStatus(file.status)).length,
    [files],
  );
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (changedOnly && !isChangedFileStatus(file.status)) return false;
      if (!normalizedFilterQuery) return true;
      return file.path.toLowerCase().includes(normalizedFilterQuery);
    });
  }, [changedOnly, files, normalizedFilterQuery]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);
  const allDirectoryPaths = useMemo(() => directoryPaths(tree), [tree]);
  const allVisibleDirectoriesCollapsed =
    allDirectoryPaths.length > 0 &&
    allDirectoryPaths.every((path) => collapsedDirectories.has(path));
  const breadcrumbs = selectedPath?.split("/").filter(Boolean) ?? [];
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? null,
    [files, selectedPath],
  );
  const selectedFileHasChanges = selectedFile ? isChangedFileStatus(selectedFile.status) : false;
  const selectedFileIsMarkdown = isMarkdownPath(selectedPath);
  const searchableLines = useMemo(() => {
    if (viewerMode === "diff" && fileDiffState.status === "ready") {
      return fileDiffState.diff.rawDiff.split("\n");
    }
    return content?.content.split("\n") ?? [];
  }, [content, fileDiffState, viewerMode]);
  const findMatches = useMemo(
    () => findTextMatches(searchableLines, findOpen ? findQuery : ""),
    [findOpen, findQuery, searchableLines],
  );
  const activeFindMatch = findMatches[activeFindIndex] ?? null;
  const findMatchesByLine = useMemo(
    () => groupFindMatchesByLine(findMatches, activeFindMatch?.id ?? null),
    [activeFindMatch?.id, findMatches],
  );
  const selectedBlameCache = selectedPath ? blameByPath[selectedPath] : undefined;
  const selectedBlame = useMemo(() => {
    if (!selectedLine || !selectedBlameCache) return null;
    return selectedBlameCache.lines.find((entry) => entry.line === selectedLine) ?? null;
  }, [selectedBlameCache, selectedLine]);
  const blameLoading = selectedBlameCache?.status === "loading";
  const blameError = selectedBlameCache?.status === "failed" ? selectedBlameCache.error : null;

  const loadBlameForPath = useCallback(
    (path: string) => {
      if (!workspace || !repo) return;
      const current = blameByPath[path];
      if (current?.status === "loading" || current?.status === "ready") return;

      setBlameByPath((previous) => ({
        ...previous,
        [path]: { status: "loading", lines: [], error: null },
      }));
      getRepositoryFileBlame({ workspace, repo, path })
        .then((lines) => {
          setBlameByPath((previous) => ({
            ...previous,
            [path]: { status: "ready", lines, error: null },
          }));
        })
        .catch((err: unknown) => {
          setBlameByPath((previous) => ({
            ...previous,
            [path]: {
              status: "failed",
              lines: [],
              error: err instanceof Error ? err.message : String(err),
            },
          }));
        });
    },
    [blameByPath, repo, workspace],
  );

  const focusFindInput = useCallback(() => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setActiveFindIndex(0);
  }, []);

  const moveFindSelection = useCallback(
    (direction: 1 | -1) => {
      setActiveFindIndex((current) => {
        const total = findMatches.length;
        if (total === 0) return 0;
        return (current + direction + total) % total;
      });
    },
    [findMatches.length],
  );

  useEffect(() => {
    if (!findOpen) return;
    focusFindInput();
  }, [findOpen, focusFindInput]);

  useEffect(() => {
    setActiveFindIndex((current) => {
      if (findMatches.length === 0) return 0;
      return Math.min(current, findMatches.length - 1);
    });
  }, [findMatches.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const targetIsFindInput = event.target === findInputRef.current;
      const targetIsEditable = isEditableShortcutTarget(event.target);
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f" &&
        (!targetIsEditable || targetIsFindInput)
      ) {
        event.preventDefault();
        setFindOpen(true);
        focusFindInput();
        return;
      }

      if (event.key === "Escape" && findOpen && (!targetIsEditable || targetIsFindInput)) {
        event.preventDefault();
        closeFind();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFind, findOpen, focusFindInput]);

  useEffect(() => {
    setSelectedPath(initialPath ?? null);
    setSelectedLine(initialLine ?? null);
    setMarkdownViewerMode("source");
  }, [initialPath, initialLine]);

  useEffect(() => {
    if (!selectedPath) {
      setViewerMode("file");
      return;
    }
    setViewerMode(selectedFileHasChanges ? "diff" : "file");
  }, [selectedFileHasChanges, selectedPath]);

  useEffect(() => {
    if (!workspace || !repo) return;
    let cancelled = false;
    setLoadingFiles(true);
    setError(null);
    setBlameByPath({});
    listRepositoryFiles(workspace, repo)
      .then((nextFiles) => {
        if (cancelled) return;
        setFiles(nextFiles);
        setSelectedPath((current) => current ?? nextFiles[0]?.path ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setFiles([]);
        setSelectedPath(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, repo]);

  useEffect(() => {
    if (!selectedPath || selectedLine == null) return;
    loadBlameForPath(selectedPath);
  }, [loadBlameForPath, selectedLine, selectedPath]);

  useEffect(() => {
    if (!workspace || !repo || !selectedPath) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setContentError(null);
    readRepositoryFile({
      workspace,
      repo,
      path: selectedPath,
    })
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContent(null);
        setContentError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, repo, selectedPath]);

  useEffect(() => {
    if (!workspace || !repo || !selectedPath || !selectedFileHasChanges || viewerMode !== "diff") {
      setFileDiffState({ status: "idle", diff: null, error: null });
      return;
    }

    let cancelled = false;
    setFileDiffState({ status: "loading", diff: null, error: null });
    getRepositoryFileDiff({
      workspace,
      repo,
      path: selectedPath,
    })
      .then((diff) => {
        if (!cancelled) setFileDiffState({ status: "ready", diff, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFileDiffState({
          status: "failed",
          diff: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, selectedFileHasChanges, selectedPath, viewerMode, workspace]);

  const handleSelectFile = (file: RepositoryFileEntry) => {
    setSelectedPath(file.path);
    setSelectedLine(null);
    setViewerMode(isChangedFileStatus(file.status) ? "diff" : "file");
    setMarkdownViewerMode("source");
    setActiveFindIndex(0);
    setExternalOpenError(null);
    onSelectFile?.(file.path, null);
  };

  const handleSelectLine = (line: number) => {
    if (!selectedPath) return;
    if (selectedLine === line) {
      setSelectedLine(null);
      onSelectFile?.(selectedPath, null);
      return;
    }
    setSelectedLine(line);
    loadBlameForPath(selectedPath);
    onSelectFile?.(selectedPath, line);
  };

  const handleToggleDirectory = (path: string) => {
    setCollapsedDirectories((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleToggleAllDirectories = () => {
    setCollapsedDirectories(
      allVisibleDirectoriesCollapsed ? new Set() : new Set(allDirectoryPaths),
    );
  };

  const handleOpenExternalFile = () => {
    if (!workspace || !repo || !selectedPath) return;
    setOpeningExternalFile(true);
    setExternalOpenError(null);
    openRepositoryFileExternal({
      workspace,
      repo,
      path: selectedPath,
      line: selectedLine,
    })
      .catch((err: unknown) => {
        setExternalOpenError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setOpeningExternalFile(false);
      });
  };

  if (!workspace || !repo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a pull request to explore its repository.
      </div>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] bg-background">
      <aside
        aria-label="Repository files"
        className="flex min-h-0 flex-col border-r border-border bg-secondary"
      >
        <div className="shrink-0 border-b border-border p-2">
          <label className="relative block">
            <span className="sr-only">Search repository files</span>
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={filterQuery}
              onChange={(event) => {
                setFilterQuery(event.target.value);
                setCollapsedDirectories(new Set());
              }}
              placeholder="Search files..."
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {loadingFiles ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading files...</p>
          ) : error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : filteredFiles.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No files match this search.</p>
          ) : (
            <RepositoryTreeRows
              nodes={tree}
              level={0}
              activePath={selectedPath}
              collapsedDirectories={collapsedDirectories}
              onSelectFile={handleSelectFile}
              onToggleDirectory={handleToggleDirectory}
            />
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <span>{files.length.toLocaleString()} files</span>
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground",
                changedOnly && "bg-muted text-foreground",
              )}
              onClick={() => setChangedOnly((current) => !current)}
              disabled={changedFileCount === 0}
              aria-pressed={changedOnly}
            >
              {changedFileCount.toLocaleString()} changed
            </button>
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleToggleAllDirectories}
          >
            {allVisibleDirectoriesCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <span className="shrink-0 font-medium text-foreground">{repo}</span>
            {breadcrumbs.map((part, index) => {
              const path = breadcrumbs.slice(0, index + 1).join("/");
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={path} className="flex min-w-0 items-center gap-1">
                  <span className="text-muted-foreground">/</span>
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 truncate font-mono",
                      isLast ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      if (!isLast) setFilterQuery(`${path}/`);
                    }}
                    disabled={isLast}
                    title={path}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
            {findOpen && (
              <div className="repo-find-bar">
                <MagnifyingGlass size={13} className="shrink-0 text-muted-foreground" />
                <input
                  ref={findInputRef}
                  type="search"
                  value={findQuery}
                  onChange={(event) => {
                    setFindQuery(event.target.value);
                    setActiveFindIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      moveFindSelection(event.shiftKey ? -1 : 1);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      closeFind();
                    }
                  }}
                  placeholder="Find in file..."
                  aria-label="Find in current file"
                  className="repo-find-input"
                />
                <span className="w-14 text-right tabular-nums">
                  {findQuery.length === 0
                    ? "0/0"
                    : findMatches.length === 0
                      ? "0/0"
                      : `${activeFindIndex + 1}/${findMatches.length}`}
                </span>
                <button
                  type="button"
                  className="repo-find-button"
                  onClick={() => moveFindSelection(-1)}
                  disabled={findMatches.length === 0}
                  aria-label="Previous match"
                  title="Previous match"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="repo-find-button"
                  onClick={() => moveFindSelection(1)}
                  disabled={findMatches.length === 0}
                  aria-label="Next match"
                  title="Next match"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="repo-find-button"
                  onClick={closeFind}
                  aria-label="Close find"
                  title="Close find"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {selectedFileHasChanges && (
              <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 hover:text-foreground",
                    viewerMode === "file" && "bg-background text-foreground",
                  )}
                  onClick={() => setViewerMode("file")}
                >
                  File
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 hover:text-foreground",
                    viewerMode === "diff" && "bg-background text-foreground",
                  )}
                  onClick={() => setViewerMode("diff")}
                >
                  Diff
                </button>
              </div>
            )}
            {selectedFileIsMarkdown && viewerMode === "file" && (
              <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 hover:text-foreground",
                    markdownViewerMode === "source" && "bg-background text-foreground",
                  )}
                  onClick={() => setMarkdownViewerMode("source")}
                >
                  Source
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 hover:text-foreground",
                    markdownViewerMode === "rendered" && "bg-background text-foreground",
                  )}
                  onClick={() => setMarkdownViewerMode("rendered")}
                >
                  Preview
                </button>
              </div>
            )}
            {externalOpenError && (
              <span className="max-w-72 truncate text-destructive" title={externalOpenError}>
                {externalOpenError}
              </span>
            )}
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              onClick={handleOpenExternalFile}
              disabled={!selectedPath || loadingContent || openingExternalFile}
              aria-label="Open file in external editor"
              title="Open in external editor"
            >
              <ArrowSquareOut size={15} />
            </button>
            <span>
              {loadingContent
                ? "Loading..."
                : content
                  ? `${formatBytes(content.size)}${content.truncated ? " truncated" : ""}`
                  : ""}
            </span>
          </div>
        </header>
        {viewerMode === "diff" && selectedFileHasChanges ? (
          <RepositoryDiffViewer
            diffState={fileDiffState}
            findMatchesByLine={findMatchesByLine}
            activeFindMatchId={activeFindMatch?.id ?? null}
          />
        ) : contentError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {contentError}
          </div>
        ) : selectedFileIsMarkdown && markdownViewerMode === "rendered" ? (
          <RepositoryMarkdownPreview file={content} />
        ) : (
          <RepositoryCodeViewer
            file={content}
            workspace={workspace}
            repo={repo}
            selectedLine={selectedLine}
            selectedBlame={selectedBlame}
            blameLoading={blameLoading}
            blameError={blameError}
            findMatchesByLine={findMatchesByLine}
            activeFindMatchId={activeFindMatch?.id ?? null}
            onSelectLine={handleSelectLine}
          />
        )}
      </div>
    </section>
  );
}
