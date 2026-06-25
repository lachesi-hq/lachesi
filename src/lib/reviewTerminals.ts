import type { ReviewTerminal, ReviewTerminalOption } from "@/types";

export const REVIEW_TERMINAL_META: Record<ReviewTerminal, { label: string; description: string }> =
  {
    wezterm: {
      label: "WezTerm",
      description: "Fast startup and native CLI launch. Best if you already use WezTerm.",
    },
    iterm: {
      label: "iTerm2",
      description: "Launch Claude in a fresh iTerm2 window using AppleScript automation.",
    },
    terminal: {
      label: "Terminal",
      description: "Built-in macOS Terminal.app. Safest fallback on every Mac.",
    },
  };

const ORDER: ReviewTerminal[] = ["wezterm", "iterm", "terminal"];

/** Merge backend availability with stable frontend labels/descriptions/order. */
export function normalizeReviewTerminals(
  terminals: ReviewTerminalOption[],
): Array<ReviewTerminalOption & { description: string }> {
  const byId = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  return ORDER.map((id) => ({
    id,
    label: byId.get(id)?.label ?? REVIEW_TERMINAL_META[id].label,
    available: byId.get(id)?.available ?? false,
    description: REVIEW_TERMINAL_META[id].description,
  }));
}
