import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingReviewBar } from "./PendingReviewBar";

const meta = {
  title: "Comments/PendingReviewBar",
  component: PendingReviewBar,
  parameters: { layout: "fullscreen" },
  args: {
    items: [
      { id: "draft-1", label: "invoice-lines-v2.controller.ts:44", title: "src/app/modules/invoice-lines/invoice-lines-v2.controller.ts:44" },
      { id: "draft-2", label: "invoice-lines-v2.controller.ts:58", title: "src/app/modules/invoice-lines/invoice-lines-v2.controller.ts:58" },
      { id: "draft-3", label: "Reply on invoice-lines-v2.controller.ts:58", title: "Reply on src/app/modules/invoice-lines/invoice-lines-v2.controller.ts:58" },
    ],
    activeDraftId: "draft-1",
    onPublishAll: () => {},
    onDiscardAll: () => {},
    onSelectDraft: () => {},
    onSelectPreviousDraft: () => {},
    onSelectNextDraft: () => {},
  },
} satisfies Meta<typeof PendingReviewBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: { publishing: false },
};

export const Publishing: Story = {
  args: { publishing: true },
};

export const Empty: Story = {
  args: { items: [], activeDraftId: null, publishing: false },
};
