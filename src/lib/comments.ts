import { changeKeyForAnchor, type FileData, fileKey } from "@/lib/diff";
import type { PrComment } from "@/types";

export interface GroupedComments {
  /** fileKey → (changeKey → comments ordered oldest-first). Anchored to a line. */
  inlineByFile: Record<string, Record<string, PrComment[]>>;
  /** fileKey → comments attached to the file but not a visible line (file-level / outdated). */
  fileLevelByFile: Record<string, PrComment[]>;
  /** Comments with no file at all (general PR conversation). */
  unanchored: PrComment[];
}

/**
 * Group PR comments for rendering:
 * - line-anchored inline comments → `inlineByFile[fileKey][changeKey]`
 * - comments on a file in the diff but no resolvable line → `fileLevelByFile[fileKey]`
 * - everything else (no file / file not in this diff) → `unanchored`
 */
export function groupComments(files: FileData[], comments: PrComment[]): GroupedComments {
  const inlineByFile: Record<string, Record<string, PrComment[]>> = {};
  const fileLevelByFile: Record<string, PrComment[]> = {};
  const unanchored: PrComment[] = [];

  const fileByPath = new Map<string, FileData>();
  for (const file of files) {
    if (file.newPath) fileByPath.set(file.newPath, file);
    if (file.oldPath) fileByPath.set(file.oldPath, file);
  }

  for (const comment of comments) {
    if (comment.deleted) continue;
    if (!comment.inline?.path) {
      unanchored.push(comment);
      continue;
    }
    const file = fileByPath.get(comment.inline.path);
    if (!file) {
      unanchored.push(comment);
      continue;
    }
    const fk = fileKey(file);
    const key = changeKeyForAnchor(file, comment.inline.to, comment.inline.from);
    if (!key) {
      // Attached to the file, but the line isn't in the diff (file-level / outdated).
      const list = fileLevelByFile[fk] ?? [];
      fileLevelByFile[fk] = list;
      list.push(comment);
      continue;
    }
    const byKey = inlineByFile[fk] ?? {};
    inlineByFile[fk] = byKey;
    const thread = byKey[key] ?? [];
    byKey[key] = thread;
    thread.push(comment);
  }

  for (const byKey of Object.values(inlineByFile)) {
    for (const thread of Object.values(byKey)) {
      thread.sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    }
  }
  for (const list of Object.values(fileLevelByFile)) {
    list.sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  }

  return { inlineByFile, fileLevelByFile, unanchored };
}
