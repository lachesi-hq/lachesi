import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { clonePullRequests } from "@/storybook/bitbucket.fixtures";
import { PrListItem } from "./PrListItem";

const [pr] = clonePullRequests();

describe("PrListItem", () => {
  it("renders the PR id, title and author", () => {
    render(<PrListItem pr={pr} active={false} onSelect={() => {}} />);
    expect(screen.getByText(`#${pr.id}`)).toBeInTheDocument();
    expect(screen.getByText(pr.title)).toBeInTheDocument();
    expect(screen.getByText(pr.authorDisplayName)).toBeInTheDocument();
  });

  it("calls onSelect with the PR when clicked", async () => {
    const onSelect = vi.fn();
    render(<PrListItem pr={pr} active={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(pr);
  });

  it("marks the active item via aria-current", () => {
    render(<PrListItem pr={pr} active onSelect={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-current", "true");
  });
});
