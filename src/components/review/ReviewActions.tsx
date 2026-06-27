import { PencilSimple, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewTerminal, ReviewTerminalOption } from "@/types";
import { PromptDialog } from "./PromptDialog";

export interface ReviewActionsProps {
  workspace: string;
  repo: string;
  /** Opens the AI panel without starting a review immediately. */
  onOpenAiReview?: () => void;
  // Kept for settings persistence via SettingsDialog — not used for terminal launch.
  reviewTerminal?: ReviewTerminal | null;
  reviewTerminalOptions?: ReviewTerminalOption[];
}

export function ReviewActions({ workspace, repo, onOpenAiReview }: ReviewActionsProps) {
  const repoKey = `${workspace}/${repo}`;
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {onOpenAiReview && (
        <Button
          size="sm"
          variant="ghost"
          className="h-9 rounded-full border border-border bg-secondary px-3 text-[13px] font-bold text-foreground hover:bg-muted"
          onClick={onOpenAiReview}
          title="Open the AI chat for this pull request"
        >
          <Sparkle size={14} />
          Ask
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-9 rounded-full border border-border bg-secondary hover:bg-muted"
        onClick={() => setEditing(true)}
        aria-label="Edit AI review prompt"
        title="Edit AI review prompt for this repo"
      >
        <PencilSimple size={15} />
      </Button>
      <PromptDialog open={editing} onOpenChange={setEditing} repoKey={repoKey} />
    </div>
  );
}
