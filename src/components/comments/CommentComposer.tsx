import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface CommentComposerProps {
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (raw: string) => void;
  onCancel: () => void;
}

export function CommentComposer({
  placeholder = "Leave a comment…",
  submitLabel = "Add to review",
  autoFocus,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <div className="border-y border-border bg-background p-2 font-sans">
      <textarea
        // biome-ignore lint/a11y/noAutofocus: composer opens on explicit user click
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && trimmed) {
            onSubmit(trimmed);
            setValue("");
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!trimmed}
          onClick={() => {
            onSubmit(trimmed);
            setValue("");
          }}
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">⌘↵ to add</span>
      </div>
    </div>
  );
}
