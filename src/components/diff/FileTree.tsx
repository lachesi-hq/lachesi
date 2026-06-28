import {
  CaretDown,
  CaretRight,
  File,
  Folder,
  FolderOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { countChanges, type FileData, fileDisplayPath, fileKey } from "@/lib/diff";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; short: string; className: string }> = {
  add: { label: "Added", short: "A", className: "text-[var(--success)]" },
  delete: { label: "Deleted", short: "D", className: "text-destructive" },
  modify: { label: "Modified", short: "M", className: "text-[var(--warning)]" },
  rename: { label: "Renamed", short: "R", className: "text-muted-foreground" },
  copy: { label: "Copied", short: "C", className: "text-muted-foreground" },
};

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
  file: FileData;
};

type TreeNode = DirectoryNode | FileNode;
export type FileTreeFolderCommand = {
  id: number;
  mode: "collapse" | "expand";
};

export interface FileTreeProps {
  files: FileData[];
  activeFileKey?: string | null;
  viewedFileKeys?: Set<string>;
  className?: string;
  folderCommand?: FileTreeFolderCommand;
  onSelect: (file: FileData) => void;
  onToggleViewed?: (file: FileData) => void;
}

function createDirectory(name: string, path: string): DirectoryNode {
  return { type: "directory", name, path, children: [], childMap: new Map() };
}

function buildTree(files: FileData[]): TreeNode[] {
  const root = createDirectory("", "");

  for (const file of files) {
    const path = fileDisplayPath(file);
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop() ?? path;
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

    const fileNode: FileNode = { type: "file", name: fileName, path, file };
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

interface TreeRowsProps {
  nodes: TreeNode[];
  level: number;
  activeFileKey?: string | null;
  viewedFileKeys?: Set<string>;
  collapsedDirectories: Set<string>;
  onSelect: (file: FileData) => void;
  onToggleViewed?: (file: FileData) => void;
  onToggleDirectory: (path: string) => void;
  forceExpanded?: boolean;
}

function TreeRows({
  nodes,
  level,
  activeFileKey,
  viewedFileKeys,
  collapsedDirectories,
  onSelect,
  onToggleViewed,
  onToggleDirectory,
  forceExpanded = false,
}: TreeRowsProps) {
  return (
    <ul className={level === 0 ? "" : "mt-0.5"}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = !forceExpanded && collapsedDirectories.has(node.path);
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
                <TreeRows
                  nodes={node.children}
                  level={level + 1}
                  activeFileKey={activeFileKey}
                  viewedFileKeys={viewedFileKeys}
                  collapsedDirectories={collapsedDirectories}
                  onSelect={onSelect}
                  onToggleViewed={onToggleViewed}
                  onToggleDirectory={onToggleDirectory}
                  forceExpanded={forceExpanded}
                />
              )}
            </li>
          );
        }

        const { additions, deletions } = countChanges(node.file);
        const key = fileKey(node.file);
        const viewed = viewedFileKeys?.has(key) ?? false;
        const active = key === activeFileKey;
        const status = STATUS_META[node.file.type] ?? {
          label: node.file.type,
          short: node.file.type.slice(0, 1).toUpperCase(),
          className: "text-muted-foreground",
        };

        return (
          <li
            key={key}
            className={`group flex h-7 items-center gap-2 px-3 text-xs ${
              active ? "bg-primary/10" : "hover:bg-muted"
            }`}
            style={{ paddingLeft: 12 + level * 16 }}
          >
            {onToggleViewed && (
              <input
                type="checkbox"
                checked={viewed}
                onChange={() => onToggleViewed(node.file)}
                aria-label={`Mark ${node.path} as viewed`}
                className="size-3.5 shrink-0 accent-primary"
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(node.file)}
              className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
                viewed ? "text-muted-foreground" : "text-foreground"
              }`}
              aria-current={active ? "true" : undefined}
            >
              <File size={13} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{node.name}</span>
              <span
                className={`ml-auto w-3 shrink-0 text-center font-mono text-[10px] font-semibold ${status.className}`}
                title={status.label}
              >
                {status.short}
              </span>
              <span className="shrink-0 text-[var(--success)]">+{additions}</span>
              <span className="shrink-0 text-destructive">-{deletions}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FileTree({
  files,
  activeFileKey,
  viewedFileKeys,
  className,
  folderCommand,
  onSelect,
  onToggleViewed,
}: FileTreeProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const normalizedFilterQuery = filterQuery.trim().toLowerCase();
  const filteredFiles = useMemo(() => {
    if (!normalizedFilterQuery) return files;
    return files.filter((file) =>
      fileDisplayPath(file).toLowerCase().includes(normalizedFilterQuery),
    );
  }, [files, normalizedFilterQuery]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);
  const allDirectoryPaths = useMemo(() => directoryPaths(tree), [tree]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!folderCommand) return;
    setCollapsedDirectories(
      folderCommand.mode === "collapse" ? new Set(allDirectoryPaths) : new Set(),
    );
  }, [folderCommand, allDirectoryPaths]);

  const handleToggleDirectory = (path: string) => {
    setCollapsedDirectories((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav
      className={cn("flex h-full flex-col bg-secondary font-sans", className)}
      aria-label="Changed files"
    >
      <div className="shrink-0 border-b border-border p-2">
        <label className="relative block">
          <span className="sr-only">Filter changed files</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Filter files..."
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {filteredFiles.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No files match this filter.</p>
        ) : (
          <TreeRows
            nodes={tree}
            level={0}
            activeFileKey={activeFileKey}
            viewedFileKeys={viewedFileKeys}
            collapsedDirectories={collapsedDirectories}
            onSelect={onSelect}
            onToggleViewed={onToggleViewed}
            onToggleDirectory={handleToggleDirectory}
            forceExpanded={normalizedFilterQuery.length > 0}
          />
        )}
      </div>
    </nav>
  );
}
