import type { Meta, StoryObj } from "@storybook/react-vite";
import { cloneComments } from "@/storybook/bitbucket.fixtures";
import { CommentThread } from "./CommentThread";

const meta = {
  title: "Comments/CommentThread",
  component: CommentThread,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }} className="border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommentThread>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithReply: Story = {
  args: { comments: cloneComments() },
};

export const SingleComment: Story = {
  args: { comments: [cloneComments()[0]] },
};
