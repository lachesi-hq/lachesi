import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type FileData, fileKey, parseUnifiedDiff } from "@/lib/diff";
import { DiffViewer } from "./DiffViewer";

const rawDiff = `diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old app
+new app
diff --git a/docs/guide.md b/docs/guide.md
index 3333333..4444444 100644
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1 +1 @@
-old guide
+new guide
`;

const files = parseUnifiedDiff(rawDiff);

function Harness({ files }: { files: FileData[] }) {
  const [viewedFileKeys, setViewedFileKeys] = useState<Set<string>>(() => new Set());

  return (
    <DiffViewer
      files={files}
      viewMode="unified"
      onViewModeChange={() => {}}
      viewedFileKeys={viewedFileKeys}
      onToggleFileViewed={(file) => {
        const key = fileKey(file);
        setViewedFileKeys((previous) => {
          const next = new Set(previous);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }}
    />
  );
}

describe("DiffViewer", () => {
  it("collapses a file when the matching file tree checkbox marks it viewed", async () => {
    const user = userEvent.setup();
    render(<Harness files={files} />);

    expect(screen.getByText("old app")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Mark src/App.tsx as viewed"));

    expect(screen.queryByText("old app")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2 viewed")).toBeInTheDocument();
  });

  it("toggles all file tree folders from the sidebar header", async () => {
    const user = userEvent.setup();
    render(<Harness files={files} />);
    const fileTree = screen.getByRole("navigation", { name: "Changed files" });

    expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse all folders" }));

    expect(within(fileTree).queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all folders" }));

    expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
  });
});
