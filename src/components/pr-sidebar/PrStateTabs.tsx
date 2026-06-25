import { cn } from "@/lib/utils";
import type { PrListFilter } from "@/types";

const FILTERS: { value: PrListFilter; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "DRAFT", label: "Drafts" },
  { value: "MERGED", label: "Merged" },
  { value: "ALL", label: "All" },
];

export interface PrStateTabsProps {
  value: PrListFilter;
  onChange: (value: PrListFilter) => void;
  /** Optional per-tab counts; a badge is shown when the count is > 0. */
  counts?: Partial<Record<PrListFilter, number>>;
}

export function PrStateTabs({ value, onChange, counts }: PrStateTabsProps) {
  return (
    <div className="flex gap-1 border-b border-border px-2 py-2" role="tablist">
      {FILTERS.map((filter) => {
        const count = counts?.[filter.value];
        const selected = value === filter.value;
        return (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(filter.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {filter.label}
            {count != null && count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-tight",
                  selected ? "bg-background text-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
