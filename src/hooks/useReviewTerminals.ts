import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { ReviewTerminalOption } from "@/types";

interface UseReviewTerminalsResult {
  terminals: ReviewTerminalOption[];
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads the review-terminal choices supported by the current machine. */
export function useReviewTerminals(): UseReviewTerminalsResult {
  const [terminals, setTerminals] = useState<ReviewTerminalOption[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTerminals(await tauriCall<ReviewTerminalOption[]>("list_review_terminals"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { terminals, loading, reload };
}
