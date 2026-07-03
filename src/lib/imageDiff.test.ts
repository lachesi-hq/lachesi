import { describe, expect, it } from "vitest";
import type { DiffstatEntry } from "@/types";
import { parseUnifiedDiff } from "./diff";
import { countReviewFileChanges, imageMimeTypeForPath, mergeImageDiffstat } from "./imageDiff";

describe("imageDiff", () => {
  it("detects supported image mime types by extension", () => {
    expect(imageMimeTypeForPath("assets/logo.png")).toBe("image/png");
    expect(imageMimeTypeForPath("assets/photo.JPEG")).toBe("image/jpeg");
    expect(imageMimeTypeForPath("icons/mark.svg")).toBe("image/svg+xml");
    expect(imageMimeTypeForPath("src/App.tsx")).toBeNull();
  });

  it("adds a synthetic file for image-only diffstat entries", () => {
    const diffstat: DiffstatEntry[] = [
      {
        status: "added",
        linesAdded: 0,
        linesRemoved: 0,
        oldPath: null,
        newPath: "public/empty-state.png",
      },
    ];

    const [file] = mergeImageDiffstat([], diffstat);

    expect(file.newPath).toBe("public/empty-state.png");
    expect(file.type).toBe("add");
    expect(file.imageDiff?.mimeType).toBe("image/png");
    expect(countReviewFileChanges(file)).toEqual({ additions: 0, deletions: 0 });
  });

  it("attaches image metadata to an existing textual svg diff", () => {
    const rawDiff = `diff --git a/icons/logo.svg b/icons/logo.svg
index 1111111..2222222 100644
--- a/icons/logo.svg
+++ b/icons/logo.svg
@@ -1 +1 @@
-<svg><rect width="1"/></svg>
+<svg><rect width="2"/></svg>
`;
    const diffstat: DiffstatEntry[] = [
      {
        status: "modified",
        linesAdded: 1,
        linesRemoved: 1,
        oldPath: "icons/logo.svg",
        newPath: "icons/logo.svg",
      },
    ];

    const [file] = mergeImageDiffstat(parseUnifiedDiff(rawDiff), diffstat);

    expect(file.hunks).toHaveLength(1);
    expect(file.imageDiff?.mimeType).toBe("image/svg+xml");
    expect(countReviewFileChanges(file)).toEqual({ additions: 1, deletions: 1 });
  });
});
