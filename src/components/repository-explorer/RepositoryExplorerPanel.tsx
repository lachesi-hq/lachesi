import {
  CaretDown,
  CaretRight,
  File,
  Folder,
  FolderOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type HighlightNode, highlightCode } from "@/lib/highlight";
import { tauriCall } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { RepositoryBlameLine, RepositoryFileContent, RepositoryFileEntry } from "@/types";

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

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
  onSelectLine,
}: {
  file: RepositoryFileContent | null;
  workspace: string;
  repo: string;
  selectedLine: number | null;
  selectedBlame: RepositoryBlameLine | null;
  blameLoading: boolean;
  blameError: string | null;
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
                  {highlighted ? renderHighlightedNodes(highlighted, `${lineNumber}`) : line}
                </code>
              </button>
              {active && (
                <div className="repo-blame-popover">
                  {blameLoading ? (
                    <span className="text-muted-foreground">Loading blame...</span>
                  ) : blameError ? (
                    <span className="text-destructive">{blameError}</span>
                  ) : selectedBlame ? (
                    <>
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
                      {selectedBlame.summary && (
                        <span className="min-w-0 truncate">{selectedBlame.summary}</span>
                      )}
                    </>
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
  const [filterQuery, setFilterQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(() => new Set());
  const [blameByPath, setBlameByPath] = useState<Record<string, BlameCacheEntry>>({});

  const normalizedFilterQuery = filterQuery.trim().toLowerCase();
  const filteredFiles = useMemo(() => {
    if (!normalizedFilterQuery) return files;
    return files.filter((file) => file.path.toLowerCase().includes(normalizedFilterQuery));
  }, [files, normalizedFilterQuery]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);
  const allDirectoryPaths = useMemo(() => directoryPaths(tree), [tree]);
  const allVisibleDirectoriesCollapsed =
    allDirectoryPaths.length > 0 &&
    allDirectoryPaths.every((path) => collapsedDirectories.has(path));
  const breadcrumbs = selectedPath?.split("/").filter(Boolean) ?? [];
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
      tauriCall<RepositoryBlameLine[]>("get_repository_file_blame", { workspace, repo, path })
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

  useEffect(() => {
    setSelectedPath(initialPath ?? null);
    setSelectedLine(initialLine ?? null);
  }, [initialPath, initialLine]);

  useEffect(() => {
    if (!workspace || !repo) return;
    let cancelled = false;
    setLoadingFiles(true);
    setError(null);
    setBlameByPath({});
    tauriCall<RepositoryFileEntry[]>("list_repository_files", { workspace, repo })
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
    tauriCall<RepositoryFileContent>("read_repository_file", {
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

  const handleSelectFile = (file: RepositoryFileEntry) => {
    setSelectedPath(file.path);
    setSelectedLine(null);
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
        <div className="flex h-8 shrink-0 items-center justify-between border-t border-border px-3 text-[11px] text-muted-foreground">
          <span>{files.length.toLocaleString()} files</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
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
          <div className="shrink-0 text-[11px] text-muted-foreground">
            {loadingContent
              ? "Loading..."
              : content
                ? `${formatBytes(content.size)}${content.truncated ? " truncated" : ""}`
                : ""}
          </div>
        </header>
        {contentError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {contentError}
          </div>
        ) : (
          <RepositoryCodeViewer
            file={content}
            workspace={workspace}
            repo={repo}
            selectedLine={selectedLine}
            selectedBlame={selectedBlame}
            blameLoading={blameLoading}
            blameError={blameError}
            onSelectLine={handleSelectLine}
          />
        )}
      </div>
    </section>
  );
}
