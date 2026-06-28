import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoryExplorerPanel } from "./RepositoryExplorerPanel";

describe("RepositoryExplorerPanel", () => {
  it("loads repository files, filters the tree, and opens a file", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <RepositoryExplorerPanel
        workspace="example-workspace"
        repo="frontend-app"
        onSelectFile={onSelectFile}
      />,
    );

    const fileTree = screen.getByLabelText("Repository files");
    await waitFor(() => {
      expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    });
    expect(screen.getByText("7 files")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search repository files" }), "format");

    expect(screen.getByRole("button", { name: /format\.ts/ })).toBeInTheDocument();
    expect(within(fileTree).queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /format\.ts/ }));

    expect(onSelectFile).toHaveBeenCalledWith("src/lib/format.ts", null);
    await waitFor(() => {
      expect(screen.getByText(/formatCurrency/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open file in external editor" }));
    expect(screen.queryByText(/Mock file not found/)).not.toBeInTheDocument();
  });

  it("collapses and expands folders from the tree", async () => {
    const user = userEvent.setup();
    render(<RepositoryExplorerPanel workspace="example-workspace" repo="frontend-app" />);

    const fileTree = screen.getByLabelText("Repository files");
    await waitFor(() => {
      expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    });

    await user.click(within(fileTree).getByRole("button", { name: /^src$/ }));

    expect(within(fileTree).queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();

    await user.click(within(fileTree).getByRole("button", { name: /^src$/ }));

    expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
  });

  it("toggles all visible folders between collapsed and expanded", async () => {
    const user = userEvent.setup();
    render(<RepositoryExplorerPanel workspace="example-workspace" repo="frontend-app" />);

    const fileTree = screen.getByLabelText("Repository files");
    await waitFor(() => {
      expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Collapse all" }));

    expect(within(fileTree).queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all" }));

    expect(within(fileTree).getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("loads blame details when a file line is selected", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <RepositoryExplorerPanel
        workspace="example-workspace"
        repo="frontend-app"
        onSelectFile={onSelectFile}
      />,
    );

    const lineButton = await screen.findByRole("button", { name: "Select line 4" });
    await user.click(lineButton);

    expect(onSelectFile).toHaveBeenCalledWith("src/App.tsx", 4);
    await waitFor(() => {
      expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    });
    expect(screen.getByText("6f52c9a1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "6f52c9a1" })).toHaveAttribute(
      "href",
      "https://bitbucket.org/example-workspace/frontend-app/commits/6f52c9a1cf5cd075762f13d0b0f8bf8d0f4f3f7d",
    );
    expect(screen.getByText(/Update fixture file/)).toBeInTheDocument();
    expect(screen.getByText(/Refresh the mock repository content/)).toBeInTheDocument();

    await user.click(lineButton);

    expect(onSelectFile).toHaveBeenLastCalledWith("src/App.tsx", null);
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
  });
});
