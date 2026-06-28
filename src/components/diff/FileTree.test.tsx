import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fileKey, parseUnifiedDiff } from "@/lib/diff";
import { FileTree } from "./FileTree";

const rawDiff = `diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1 +1 @@
-old app
+new app
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/components/Button.tsx
@@ -0,0 +1 @@
+export const Button = () => null;
diff --git a/docs/old.md b/docs/old.md
deleted file mode 100644
index 4444444..0000000
--- a/docs/old.md
+++ /dev/null
@@ -1 +0,0 @@
-old docs
`;

const files = parseUnifiedDiff(rawDiff);

describe("FileTree", () => {
  it("groups changed files by directory", () => {
    render(<FileTree files={files} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /src/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /components/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /docs/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Button\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /old\.md/ })).toBeInTheDocument();
  });

  it("collapses and expands folders", async () => {
    const user = userEvent.setup();
    render(<FileTree files={files} onSelect={() => {}} />);

    await user.click(screen.getByRole("button", { name: /src/ }));
    expect(screen.queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Button\.tsx/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /src/ }));
    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Button\.tsx/ })).toBeInTheDocument();
  });

  it("collapses and expands all folders when requested", () => {
    const { rerender } = render(<FileTree files={files} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Button\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /old\.md/ })).toBeInTheDocument();

    rerender(
      <FileTree files={files} folderCommand={{ id: 1, mode: "collapse" }} onSelect={() => {}} />,
    );

    expect(screen.queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Button\.tsx/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /old\.md/ })).not.toBeInTheDocument();

    rerender(
      <FileTree files={files} folderCommand={{ id: 2, mode: "expand" }} onSelect={() => {}} />,
    );

    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Button\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /old\.md/ })).toBeInTheDocument();
  });

  it("selects files and marks the active file", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const activeFile = files.find((file) => file.newPath === "src/components/Button.tsx");
    if (!activeFile) throw new Error("Expected fixture file");

    render(<FileTree files={files} activeFileKey={fileKey(activeFile)} onSelect={onSelect} />);

    const button = screen.getByRole("button", { name: /Button\.tsx/ });
    expect(button).toHaveAttribute("aria-current", "true");

    await user.click(button);
    expect(onSelect).toHaveBeenCalledWith(activeFile);
  });

  it("filters files by path", async () => {
    const user = userEvent.setup();
    render(<FileTree files={files} onSelect={() => {}} />);

    await user.type(screen.getByRole("searchbox", { name: "Filter changed files" }), "button");

    expect(screen.getByRole("button", { name: /Button\.tsx/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /old\.md/ })).not.toBeInTheDocument();
  });

  it("shows an empty state when the filter has no matches", async () => {
    const user = userEvent.setup();
    render(<FileTree files={files} onSelect={() => {}} />);

    await user.type(screen.getByRole("searchbox", { name: "Filter changed files" }), "nomatch");

    expect(screen.getByText("No files match this filter.")).toBeInTheDocument();
  });
});
