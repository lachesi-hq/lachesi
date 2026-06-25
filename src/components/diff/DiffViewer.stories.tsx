import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { parseUnifiedDiff } from "@/lib/diff";
import { sampleRawDiff } from "@/storybook/bitbucket.fixtures";
import type { DiffViewMode } from "@/types";
import { DiffViewer } from "./DiffViewer";

type RenderableDiffViewMode = Exclude<DiffViewMode, "conversation">;

const files = parseUnifiedDiff(sampleRawDiff);

const meta = {
  title: "Diff/DiffViewer",
  component: DiffViewer,
  parameters: { layout: "fullscreen" },
  args: { files, viewMode: "unified", onViewModeChange: () => {} },
} satisfies Meta<typeof DiffViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness({ initial }: { initial: RenderableDiffViewMode }) {
  const [mode, setMode] = useState<RenderableDiffViewMode>(initial);
  return (
    <div style={{ height: "100vh" }}>
      <DiffViewer
        files={files}
        viewMode={mode}
        onViewModeChange={(next) => {
          if (next !== "conversation") setMode(next);
        }}
      />
    </div>
  );
}

export const Unified: Story = {
  render: () => <Harness initial="unified" />,
};

export const Split: Story = {
  render: () => <Harness initial="split" />,
};

export const Empty: Story = {
  args: { files: [] },
};
