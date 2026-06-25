import type { Meta, StoryObj } from "@storybook/react-vite";
import { clonePullRequests } from "@/storybook/bitbucket.fixtures";
import { PrListItem } from "./PrListItem";

const [pr] = clonePullRequests();

const meta = {
  title: "PR Sidebar/PrListItem",
  component: PrListItem,
  parameters: { layout: "centered" },
  args: { onSelect: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }} className="border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PrListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { pr, active: false },
};

export const Active: Story = {
  args: { pr, active: true },
};

export const NoComments: Story = {
  args: { pr: { ...pr, commentCount: 0 }, active: false },
};
