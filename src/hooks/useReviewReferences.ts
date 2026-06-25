import { useCallback, useEffect, useState } from "react";
import { loadReviewReferences, saveReviewReferences } from "@/lib/reviewReferencesStorage";
import type { ReviewReference, ReviewReferenceType } from "@/types";

export type ReviewReferenceInput = Omit<
  ReviewReference,
  "id" | "source" | "createdAt" | "updatedAt"
> & {
  type: ReviewReferenceType;
};

export interface UseReviewReferencesResult {
  references: ReviewReference[];
  addReference: (input: ReviewReferenceInput) => void;
  updateReference: (id: string, input: ReviewReferenceInput) => void;
  removeReference: (id: string) => void;
}

export function useReviewReferences(
  workspace: string | null,
  repo: string | null,
  prId: number | null,
): UseReviewReferencesResult {
  const active = workspace != null && repo != null && prId != null;
  const contextKey = active ? `${workspace}/${repo}/${prId}` : null;
  const [state, setState] = useState<{ contextKey: string | null; references: ReviewReference[] }>({
    contextKey: null,
    references: [],
  });

  useEffect(() => {
    setState({
      contextKey,
      references: loadReviewReferences(workspace, repo, prId),
    });
  }, [workspace, repo, prId, contextKey]);

  useEffect(() => {
    if (!active) return;
    if (state.contextKey !== contextKey) return;
    try {
      saveReviewReferences(workspace, repo, prId, state.references);
    } catch {
      // Reference context is a local convenience; ignore storage failures.
    }
  }, [active, contextKey, workspace, repo, prId, state]);

  const addReference = useCallback(
    (input: ReviewReferenceInput) => {
      const now = Date.now();
      setState((prev) => ({
        contextKey,
        references: [
          ...(prev.contextKey === contextKey ? prev.references : []),
          {
            ...input,
            id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
            source: "manual",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }));
    },
    [contextKey],
  );

  const updateReference = useCallback(
    (id: string, input: ReviewReferenceInput) => {
      setState((prev) => {
        if (prev.contextKey !== contextKey) return prev;
        return {
          ...prev,
          references: prev.references.map((reference) =>
            reference.id === id ? { ...reference, ...input, updatedAt: Date.now() } : reference,
          ),
        };
      });
    },
    [contextKey],
  );

  const removeReference = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.contextKey !== contextKey) return prev;
        return {
          ...prev,
          references: prev.references.filter((reference) => reference.id !== id),
        };
      });
    },
    [contextKey],
  );

  return {
    references: state.contextKey === contextKey ? state.references : [],
    addReference,
    updateReference,
    removeReference,
  };
}
