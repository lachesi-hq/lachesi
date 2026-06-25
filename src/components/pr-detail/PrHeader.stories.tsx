import type { Meta, StoryObj } from "@storybook/react-vite";
import { clonePullRequestDetail } from "@/storybook/bitbucket.fixtures";
import { PrHeader } from "./PrHeader";

const meta = {
  title: "PR Detail/PrHeader",
  component: PrHeader,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PrHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { pr: clonePullRequestDetail() },
};

export const Merged: Story = {
  args: { pr: { ...clonePullRequestDetail(), state: "MERGED" } },
};

export const NoDescriptionNoReviewers: Story = {
  args: { pr: { ...clonePullRequestDetail(), descriptionRaw: "", reviewers: [] } },
};
