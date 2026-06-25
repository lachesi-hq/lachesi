import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "j / k", label: "Next / previous pull request" },
  { keys: "] / [", label: "Next / previous changed file" },
  { keys: "u", label: "Cycle unified / split / conversation diff" },
  { keys: "o", label: "Open overview dashboard" },
  { keys: "r", label: "Toggle AI review panel" },
  { keys: "?", label: "Show this help" },
  { keys: "Esc", label: "Close dialog / composer / overview" },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Navigate reviews without the mouse.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4">
              <span className="text-foreground/90">{s.label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
