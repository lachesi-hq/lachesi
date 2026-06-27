import { Markdown } from "@/components/Markdown";
import { Avatar } from "@/components/ui/avatar";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PrComment } from "@/types";

export interface CommentItemProps {
  comment: PrComment;
  isReply?: boolean;
}

export function CommentItem({ comment, isReply }: CommentItemProps) {
  const userName = comment.userDisplayName || "Unknown";

  return (
    <div className={cn("text-sm", isReply && "ml-5 border-l-2 border-border pl-3")}>
      <div className="flex items-center gap-2">
        <Avatar name={userName} size="lg" />
        <span className="text-xs text-muted-foreground">{formatRelative(comment.createdOn)}</span>
      </div>
      <Markdown className="mt-0.5 text-foreground/90">{comment.contentRaw}</Markdown>
    </div>
  );
}
