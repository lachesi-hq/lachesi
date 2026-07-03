import { useEffect, useMemo, useState } from "react";
import { parseUnifiedDiff } from "@/lib/diff";
import {
  diffstatImagePath,
  type ImagePreviewState,
  imageDiffKey,
  imagePreviewPath,
  imagePreviewSide,
  mergeImageDiffstat,
  type ReviewFileData,
} from "@/lib/imageDiff";
import { tauriCall } from "@/lib/tauri";
import type { DiffstatEntry, PrFilePreview, ReviewProvider } from "@/types";

interface UseDiffResult {
  files: ReviewFileData[];
  raw: string;
  loading: boolean;
  error: string | null;
}

/** Loads a PR's raw unified diff and parses it (memoized) into files. */
export function useDiff(
  provider: ReviewProvider | null,
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UseDiffResult {
  const [raw, setRaw] = useState("");
  const [diffstat, setDiffstat] = useState<DiffstatEntry[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Record<string, ImagePreviewState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prId == null || !workspace || !repo) {
      setRaw("");
      setDiffstat([]);
      setImagePreviews({});
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDiffstat([]);
    setImagePreviews({});
    tauriCall<string>("get_pr_diff", { provider, workspace, repo, id: prId })
      .then((d) => {
        if (cancelled) return;
        setRaw(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    tauriCall<DiffstatEntry[]>("get_diffstat", { provider, workspace, repo, id: prId })
      .then((nextDiffstat) => {
        if (cancelled) return;
        setDiffstat(nextDiffstat);
        const imageEntries = nextDiffstat.filter((entry) => diffstatImagePath(entry) != null);
        if (imageEntries.length > 0) {
          setImagePreviews(
            Object.fromEntries(
              imageEntries.map((entry) => [
                imageDiffKey(entry),
                { status: "loading", preview: null, error: null } satisfies ImagePreviewState,
              ]),
            ),
          );
        }
        for (const entry of imageEntries) {
          const path = imagePreviewPath(entry);
          if (!path) continue;
          const key = imageDiffKey(entry);
          tauriCall<PrFilePreview>("get_pr_file_preview", {
            provider,
            workspace,
            repo,
            id: prId,
            path,
            side: imagePreviewSide(entry),
          })
            .then((preview) => {
              if (cancelled) return;
              setImagePreviews((previous) => ({
                ...previous,
                [key]: { status: "ready", preview, error: null },
              }));
            })
            .catch((e) => {
              if (cancelled) return;
              setImagePreviews((previous) => ({
                ...previous,
                [key]: {
                  status: "failed",
                  preview: null,
                  error: e instanceof Error ? e.message : String(e),
                },
              }));
            });
        }
      })
      .catch(() => {
        if (!cancelled) setDiffstat([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, workspace, repo, prId]);

  const files = useMemo(
    () => mergeImageDiffstat(parseUnifiedDiff(raw), diffstat, imagePreviews),
    [diffstat, imagePreviews, raw],
  );

  return { files, raw, loading, error };
}
