import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommentComposer } from "./CommentComposer";

const meta = {
  title: "Comments/CommentComposer",
  component: CommentComposer,
  parameters: { layout: "padded" },
  args: {
    onSubmit: (raw: string) => alert(`Add to review:\n${raw}`),
    onCancel: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }} className="border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReplyVariant: Story = {
  args: { submitLabel: "Reply", placeholder: "Reply…" },
};
