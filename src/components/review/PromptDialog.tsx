import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEFAULT_REVIEW_PROMPT, getReviewPrompt, setReviewPrompt } from "@/lib/reviewPrompt";

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoKey: string;
}

export function PromptDialog({ open, onOpenChange, repoKey }: PromptDialogProps) {
  const [text, setText] = useState("");
  const [hasCustomPrompt, setHasCustomPrompt] = useState(false);

  useEffect(() => {
    if (!open) return;
    const customPrompt = getReviewPrompt(repoKey).trim();
    setHasCustomPrompt(Boolean(customPrompt));
    setText(customPrompt || DEFAULT_REVIEW_PROMPT);
  }, [open, repoKey]);

  const savePrompt = () => {
    const next = text.trim();
    setReviewPrompt(repoKey, next === DEFAULT_REVIEW_PROMPT.trim() ? "" : text);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>AI review prompt</DialogTitle>
          <DialogDescription>
            Prompt used for AI reviews on <span className="font-mono">{repoKey}</span>. Edit it
            directly; saving the unchanged built-in prompt keeps using the default.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {hasCustomPrompt
              ? "Using a custom prompt for this repository."
              : "Using the built-in default prompt."}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(DEFAULT_REVIEW_PROMPT);
              setHasCustomPrompt(false);
            }}
          >
            Reset to default
          </Button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          className="min-h-[24rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={savePrompt}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
