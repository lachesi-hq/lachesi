import { Markdown } from "@/components/Markdown";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PrComment } from "@/types";

export interface CommentItemProps {
  comment: PrComment;
  isReply?: boolean;
}

export function CommentItem({ comment, isReply }: CommentItemProps) {
  return (
    <div className={cn("text-sm", isReply && "ml-5 border-l-2 border-border pl-3")}>
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{comment.userDisplayName || "Unknown"}</span>
        <span className="text-xs text-muted-foreground">{formatRelative(comment.createdOn)}</span>
      </div>
      <Markdown className="mt-0.5 text-foreground/90">{comment.contentRaw}</Markdown>
    </div>
  );
}
