import type { FileData } from "@/lib/diff";
import type { DiffFileStatus, DiffstatEntry, PrFilePreview } from "@/types";

export type ImagePreviewState =
  | { status: "idle"; preview: null; error: null }
  | { status: "loading"; preview: null; error: null }
  | { status: "ready"; preview: PrFilePreview; error: null }
  | { status: "failed"; preview: null; error: string };

export interface ImageDiffMetadata {
  kind: "image";
  status: DiffFileStatus;
  oldPath: string | null;
  newPath: string | null;
  path: string;
  mimeType: string;
  linesAdded: number;
  linesRemoved: number;
  previewSide: "old" | "new";
  preview: ImagePreviewState;
}

export type ReviewFileData = FileData & {
  imageDiff?: ImageDiffMetadata;
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export function imageMimeTypeForPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.toLowerCase();
  const extension = Object.keys(IMAGE_MIME_BY_EXTENSION).find((ext) => normalized.endsWith(ext));
  return extension ? IMAGE_MIME_BY_EXTENSION[extension] : null;
}

export function isSupportedImagePath(path: string | null | undefined): boolean {
  return imageMimeTypeForPath(path) != null;
}

export function diffstatImagePath(entry: DiffstatEntry): string | null {
  const path = entry.newPath ?? entry.oldPath;
  return isSupportedImagePath(path) ? path : null;
}

export function imagePreviewSide(entry: DiffstatEntry): "old" | "new" {
  return entry.status === "removed" ? "old" : "new";
}

export function imagePreviewPath(entry: DiffstatEntry): string | null {
  return imagePreviewSide(entry) === "old" ? entry.oldPath : entry.newPath;
}

export function imageDiffKey(entry: DiffstatEntry): string {
  return `${entry.oldPath ?? ""}->${entry.newPath ?? ""}`;
}

function fileMatchesDiffstat(file: FileData, entry: DiffstatEntry): boolean {
  return (
    (entry.newPath != null && file.newPath === entry.newPath) ||
    (entry.oldPath != null && file.oldPath === entry.oldPath)
  );
}

function diffTypeForStatus(status: DiffFileStatus): FileData["type"] {
  switch (status) {
    case "added":
      return "add";
    case "removed":
      return "delete";
    case "renamed":
      return "rename";
    default:
      return "modify";
  }
}

function makeImageMetadata(
  entry: DiffstatEntry,
  preview: ImagePreviewState | undefined,
): ImageDiffMetadata {
  const path = diffstatImagePath(entry) ?? entry.newPath ?? entry.oldPath ?? "";
  const mimeType = imageMimeTypeForPath(path) ?? "application/octet-stream";
  return {
    kind: "image",
    status: entry.status,
    oldPath: entry.oldPath,
    newPath: entry.newPath,
    path,
    mimeType,
    linesAdded: entry.linesAdded,
    linesRemoved: entry.linesRemoved,
    previewSide: imagePreviewSide(entry),
    preview: preview ?? { status: "idle", preview: null, error: null },
  };
}

function createSyntheticImageFile(
  entry: DiffstatEntry,
  preview: ImagePreviewState | undefined,
): ReviewFileData {
  return {
    hunks: [],
    oldEndingNewLine: true,
    newEndingNewLine: true,
    oldPath: entry.oldPath ?? entry.newPath ?? "",
    newPath: entry.newPath ?? entry.oldPath ?? "",
    oldRevision: "",
    newRevision: "",
    oldMode: "100644",
    newMode: "100644",
    type: diffTypeForStatus(entry.status),
    imageDiff: makeImageMetadata(entry, preview),
  };
}

export function countReviewFileChanges(file: ReviewFileData): {
  additions: number;
  deletions: number;
} {
  if (file.imageDiff) {
    return {
      additions: file.imageDiff.linesAdded,
      deletions: file.imageDiff.linesRemoved,
    };
  }
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === "insert") additions += 1;
      else if (change.type === "delete") deletions += 1;
    }
  }
  return { additions, deletions };
}

export function mergeImageDiffstat(
  files: FileData[],
  diffstat: DiffstatEntry[],
  previews: Record<string, ImagePreviewState> = {},
): ReviewFileData[] {
  const result: ReviewFileData[] = files.map((file) => ({ ...file }));

  for (const entry of diffstat) {
    if (!diffstatImagePath(entry)) continue;
    const preview = previews[imageDiffKey(entry)];
    const existing = result.find((file) => fileMatchesDiffstat(file, entry));
    if (existing) {
      existing.imageDiff = makeImageMetadata(entry, preview);
      continue;
    }
    result.push(createSyntheticImageFile(entry, preview));
  }

  return result;
}
