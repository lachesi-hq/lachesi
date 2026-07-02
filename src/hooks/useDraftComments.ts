import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { DraftComment, PrComment, ReviewProvider } from "@/types";

function storageKey(
  provider: ReviewProvider,
  workspace: string,
  repo: string,
  prId: number,
): string {
  return `lachesi.drafts.${provider}:${workspace}/${repo}/${prId}`;
}

function loadDrafts(
  provider: ReviewProvider,
  workspace: string,
  repo: string,
  prId: number,
): DraftComment[] {
  try {
    const raw = localStorage.getItem(storageKey(provider, workspace, repo, prId));
    return raw ? (JSON.parse(raw) as DraftComment[]) : [];
  } catch {
    return [];
  }
}

export type NewDraft = Pick<
  DraftComment,
  "path" | "to" | "from" | "raw" | "parentId" | "source" | "findingRef" | "publicationMode"
>;
export type DraftPatch = Partial<Pick<DraftComment, "raw">>;

export interface PublishResult {
  published: number;
  failed: { draft: DraftComment; error: string }[];
}

export interface PublishDraftResult {
  draft: DraftComment | null;
  comment: PrComment | null;
  error: string | null;
}

interface UseDraftCommentsResult {
  drafts: DraftComment[];
  publishing: boolean;
  publishingDraftId: string | null;
  addDraft: (draft: NewDraft) => DraftComment | null;
  addDrafts: (drafts: NewDraft[]) => DraftComment[];
  updateDraft: (localId: string, patch: DraftPatch) => void;
  removeDraft: (localId: string) => void;
  discardAll: () => void;
  publishDraft: (localId: string) => Promise<PublishDraftResult>;
  publishAll: () => Promise<PublishResult>;
}

export interface DraftCommentLifecycleOptions {
  onDraftPublished?: (draft: DraftComment, comment: PrComment) => void | Promise<void>;
  onDraftRemoved?: (draft: DraftComment) => void | Promise<void>;
  onDraftsDiscarded?: (drafts: DraftComment[]) => void | Promise<void>;
}

function materializeDraft(prId: number, draft: NewDraft, index: number): DraftComment {
  return {
    ...draft,
    prId,
    localId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    source: draft.source ?? "manual",
    findingRef: draft.findingRef ?? null,
    publicationMode: draft.publicationMode ?? null,
  };
}

async function publishDraftToServer(
  provider: ReviewProvider,
  workspace: string,
  repo: string,
  prId: number,
  draft: DraftComment,
): Promise<PrComment> {
  if (draft.parentId != null) {
    return tauriCall<PrComment>("create_general_comment", {
      provider,
      workspace,
      repo,
      id: prId,
      raw: draft.raw,
      parentId: draft.parentId,
    });
  }

  return tauriCall<PrComment>("create_inline_comment", {
    provider,
    workspace,
    repo,
    id: prId,
    req: {
      path: draft.path,
      to: draft.to,
      from: draft.from,
      raw: draft.raw,
      parentId: null,
    },
  });
}

/**
 * GitHub-style "pending review": comments are staged locally (persisted per
 * repo + PR) and published in a batch to the owning repo.
 */
export function useDraftComments(
  provider: ReviewProvider | null,
  workspace: string | null,
  repo: string | null,
  prId: number | null,
  options: DraftCommentLifecycleOptions = {},
): UseDraftCommentsResult {
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  const { onDraftPublished, onDraftRemoved, onDraftsDiscarded } = options;

  const active = provider != null && workspace != null && repo != null && prId != null;

  useEffect(() => {
    setDrafts(active ? loadDrafts(provider, workspace, repo, prId) : []);
  }, [active, provider, workspace, repo, prId]);

  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(storageKey(provider, workspace, repo, prId), JSON.stringify(drafts));
    } catch {
      // ignore storage failures
    }
  }, [drafts, active, provider, workspace, repo, prId]);

  const addDraft = useCallback(
    (draft: NewDraft) => {
      if (prId == null) return null;
      const nextDraft = materializeDraft(prId, draft, drafts.length);
      setDrafts((prev) => [...prev, nextDraft]);
      return nextDraft;
    },
    [prId, drafts.length],
  );

  const addDrafts = useCallback(
    (nextDrafts: NewDraft[]) => {
      if (prId == null || nextDrafts.length === 0) return [];
      const materialized = nextDrafts.map((draft, index) =>
        materializeDraft(prId, draft, drafts.length + index),
      );
      setDrafts((prev) => [...prev, ...materialized]);
      return materialized;
    },
    [prId, drafts.length],
  );

  const removeDraft = useCallback(
    (localId: string) => {
      const draft = drafts.find((candidate) => candidate.localId === localId) ?? null;
      setDrafts((prev) => prev.filter((d) => d.localId !== localId));
      if (draft && onDraftRemoved) {
        void Promise.resolve(onDraftRemoved(draft));
      }
    },
    [drafts, onDraftRemoved],
  );

  const updateDraft = useCallback((localId: string, patch: DraftPatch) => {
    setDrafts((prev) =>
      prev.map((draft) => (draft.localId === localId ? { ...draft, ...patch } : draft)),
    );
  }, []);

  const discardAll = useCallback(() => {
    const discarded = [...drafts];
    setDrafts([]);
    if (discarded.length > 0 && onDraftsDiscarded) {
      void Promise.resolve(onDraftsDiscarded(discarded));
    }
  }, [drafts, onDraftsDiscarded]);

  const publishDraft = useCallback(
    async (localId: string): Promise<PublishDraftResult> => {
      if (!active) {
        return { draft: null, comment: null, error: "No active pull request selected." };
      }

      const draft = drafts.find((candidate) => candidate.localId === localId) ?? null;
      if (!draft) {
        return { draft: null, comment: null, error: "Draft comment not found." };
      }

      setPublishing(true);
      setPublishingDraftId(localId);
      try {
        const comment = await publishDraftToServer(provider, workspace, repo, prId, draft);
        setDrafts((prev) => prev.filter((candidate) => candidate.localId !== localId));
        if (onDraftPublished) {
          void Promise.resolve(onDraftPublished(draft, comment));
        }
        return { draft, comment, error: null };
      } catch (e) {
        return {
          draft,
          comment: null,
          error: e instanceof Error ? e.message : String(e),
        };
      } finally {
        setPublishingDraftId(null);
        setPublishing(false);
      }
    },
    [active, provider, workspace, repo, prId, drafts, onDraftPublished],
  );

  const publishAll = useCallback(async (): Promise<PublishResult> => {
    if (!active) return { published: 0, failed: [] };
    setPublishing(true);
    const failed: PublishResult["failed"] = [];
    let published = 0;
    for (const draft of [...drafts]) {
      setPublishingDraftId(draft.localId);
      try {
        const comment = await publishDraftToServer(provider, workspace, repo, prId, draft);
        published += 1;
        setDrafts((prev) => prev.filter((d) => d.localId !== draft.localId));
        if (onDraftPublished) {
          void Promise.resolve(onDraftPublished(draft, comment));
        }
      } catch (e) {
        failed.push({ draft, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setPublishingDraftId(null);
    setPublishing(false);
    return { published, failed };
  }, [active, provider, workspace, repo, prId, drafts, onDraftPublished]);

  return {
    drafts,
    publishing,
    publishingDraftId,
    addDraft,
    addDrafts,
    updateDraft,
    removeDraft,
    discardAll,
    publishDraft,
    publishAll,
  };
}
