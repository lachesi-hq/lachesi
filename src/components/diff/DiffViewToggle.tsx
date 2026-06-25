import { ChatCircleText, Columns, Rows } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { DiffViewMode } from "@/types";

export interface DiffViewToggleProps {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
}

const MODES: { mode: DiffViewMode; label: string; Icon: typeof Rows }[] = [
  { mode: "unified", label: "Unified", Icon: Rows },
  { mode: "split", label: "Split", Icon: Columns },
  { mode: "conversation", label: "Conversation", Icon: ChatCircleText },
];

export function DiffViewToggle({ value, onChange }: DiffViewToggleProps) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {MODES.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            value === mode
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
