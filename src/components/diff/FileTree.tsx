import { countChanges, type FileData, fileDisplayPath, fileKey } from "@/lib/diff";

const STATUS_DOT: Record<string, string> = {
  add: "text-[var(--success)]",
  delete: "text-destructive",
  modify: "text-[var(--warning)]",
  rename: "text-muted-foreground",
  copy: "text-muted-foreground",
};

export interface FileTreeProps {
  files: FileData[];
  viewedFileKeys?: Set<string>;
  onSelect: (file: FileData) => void;
  onToggleViewed?: (file: FileData) => void;
}

export function FileTree({ files, viewedFileKeys, onSelect, onToggleViewed }: FileTreeProps) {
  return (
    <ul className="max-h-72 overflow-auto border-b border-border bg-secondary py-1 font-sans">
      {files.map((file) => {
        const { additions, deletions } = countChanges(file);
        const key = fileKey(file);
        const viewed = viewedFileKeys?.has(key) ?? false;
        const path = fileDisplayPath(file);
        const slash = path.lastIndexOf("/");
        const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
        const name = slash >= 0 ? path.slice(slash + 1) : path;
        return (
          <li key={key} className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted">
            {onToggleViewed && (
              <input
                type="checkbox"
                checked={viewed}
                onChange={() => onToggleViewed(file)}
                aria-label={`Mark ${path} as viewed`}
                className="size-3.5 shrink-0 accent-primary"
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(file)}
              className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
                viewed ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              <span className={`shrink-0 ${STATUS_DOT[file.type] ?? "text-muted-foreground"}`}>
                ●
              </span>
              <span className="truncate font-mono">
                <span className="text-muted-foreground">{dir}</span>
                {name}
              </span>
              <span className="ml-auto shrink-0 text-[var(--success)]">+{additions}</span>
              <span className="shrink-0 text-destructive">-{deletions}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
