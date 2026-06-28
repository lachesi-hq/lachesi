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
  });
});
