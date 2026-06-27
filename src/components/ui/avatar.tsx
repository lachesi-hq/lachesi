import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#4b7aec", "#26c0ab", "#a55ee9", "#d29922", "#f97316", "#8b5cf6"];
const INITIAL_COLOR_HINTS: Record<string, string> = {
  A: "#4b7aec",
  J: "#a55ee9",
  S: "#26c0ab",
};

const SIZE_CLASS = {
  sm: "size-[18px] text-[8px]",
  md: "size-[22px] text-[9px]",
  lg: "size-6 text-[10px]",
} as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function colorForName(name: string): string {
  const initials = initialsForName(name);
  const hinted = INITIAL_COLOR_HINTS[initials[0]];
  if (hinted) return hinted;

  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[Math.abs(hash)];
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const initials = initialsForName(name);

  return (
    <span
      className={cn(
        "group/avatar relative inline-flex shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      title={name}
    >
      <span
        role="img"
        aria-label={name}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium leading-none text-white",
          SIZE_CLASS[size],
        )}
        style={{ backgroundColor: colorForName(name) }}
      >
        {initials}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 max-w-48 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium leading-none text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100"
      >
        {name}
      </span>
    </span>
  );
}
