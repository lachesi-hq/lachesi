import { CaretLeft, CaretRight, PaperPlaneTilt } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export interface PendingReviewNavItem {
  id: string;
  label: string;
  title: string;
}

export interface PendingReviewBarProps {
  items: PendingReviewNavItem[];
  activeDraftId: string | null;
  publishing: boolean;
  onSelectDraft: (localId: string) => void;
  onSelectPreviousDraft: () => void;
  onSelectNextDraft: () => void;
  onPublishAll: () => void;
  onDiscardAll: () => void;
}

export function PendingReviewBar({
  items,
  activeDraftId,
  publishing,
  onSelectDraft,
  onSelectPreviousDraft,
  onSelectNextDraft,
  onPublishAll,
  onDiscardAll,
}: PendingReviewBarProps) {
  if (items.length === 0) return null;

  const activeIndex = items.findIndex((item) => item.id === activeDraftId);
  const selectedIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeItem = items[selectedIndex] ?? null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-secondary px-4 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <PaperPlaneTilt size={16} />
        <div className="min-w-0">
          <div className="font-medium text-foreground">Pending review</div>
          <div className="truncate text-xs text-muted-foreground">
            {items.length} staged comment{items.length === 1 ? "" : "s"}
            {activeItem ? ` • ${selectedIndex + 1} of ${items.length} • ${activeItem.label}` : ""}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectPreviousDraft}
          disabled={publishing || items.length <= 1}
          title="Previous staged comment"
        >
          <CaretLeft size={14} />
          Prev
        </Button>
        <select
          value={activeItem?.id ?? ""}
          onChange={(event) => onSelectDraft(event.target.value)}
          disabled={publishing}
          className="min-w-[16rem] max-w-full flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {items.map((item, index) => (
            <option key={item.id} value={item.id} title={item.title}>
              {index + 1}. {item.label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectNextDraft}
          disabled={publishing || items.length <= 1}
          title="Next staged comment"
        >
          Next
          <CaretRight size={14} />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscardAll} disabled={publishing}>
          Discard
        </Button>
        <Button size="sm" onClick={onPublishAll} disabled={publishing}>
          {publishing ? "Publishing…" : "Publish all"}
        </Button>
      </div>
    </div>
  );
}
