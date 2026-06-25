import { ArrowBendDownRight } from "@phosphor-icons/react";
import { useState } from "react";
import type { DraftComment, PrComment } from "@/types";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { DraftCommentRow } from "./DraftCommentRow";

export interface CommentThreadProps {
  comments: PrComment[];
  /** Staged (unpublished) replies to this thread. */
  replyDrafts?: DraftComment[];
  /** Stage a reply to this thread. When omitted, no reply affordance is shown. */
  onReply?: (raw: string) => void;
  activeDraftId?: string | null;
  publishingDraftId?: string | null;
  onFocusDraft?: (localId: string) => void;
  onUpdateReplyDraft?: (localId: string, raw: string) => void;
  onPublishReplyDraft?: (localId: string) => void;
  onRemoveReplyDraft?: (localId: string) => void;
}

export function CommentThread({
  comments,
  replyDrafts,
  onReply,
  activeDraftId,
  publishingDraftId,
  onFocusDraft,
  onUpdateReplyDraft,
  onPublishReplyDraft,
  onRemoveReplyDraft,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false);

  return (
    <div className="border-y border-border bg-muted/40 px-3 py-2 font-sans">
      <div className="flex flex-col gap-2.5">
        {comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} isReply={comment.parentId != null} />
        ))}
      </div>

      {replyDrafts?.map((d) => (
        <DraftCommentRow
          key={d.localId}
          draft={d}
          active={d.localId === activeDraftId}
          publishing={d.localId === publishingDraftId}
          onFocus={() => onFocusDraft?.(d.localId)}
          onUpdate={(raw) => onUpdateReplyDraft?.(d.localId, raw)}
          onPublish={() => onPublishReplyDraft?.(d.localId)}
          onRemove={() => onRemoveReplyDraft?.(d.localId)}
        />
      ))}

      {onReply &&
        (replying ? (
          <div className="mt-2">
            <CommentComposer
              autoFocus
              submitLabel="Add reply"
              placeholder="Reply…"
              onSubmit={(raw) => {
                onReply(raw);
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ArrowBendDownRight size={12} /> Reply
          </button>
        ))}
    </div>
  );
}
