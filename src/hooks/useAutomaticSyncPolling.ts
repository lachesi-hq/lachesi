import { useEffect, useRef } from "react";
import type { AutomaticSyncIntervalSeconds } from "@/types";

export const AUTOMATIC_SYNC_INTERVAL_OPTIONS: {
  label: string;
  value: AutomaticSyncIntervalSeconds | null;
}[] = [
  { label: "Off", value: null },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
];

interface UseAutomaticSyncPollingArgs {
  enabled: boolean;
  intervalSeconds: AutomaticSyncIntervalSeconds | null;
  contextKey: string;
  onSync: () => Promise<void>;
}

/**
 * Runs the shared refresh path on a configurable interval while ensuring a
 * slow background sync cannot overlap with the next polling tick.
 */
export function useAutomaticSyncPolling({
  enabled,
  intervalSeconds,
  contextKey,
  onSync,
}: UseAutomaticSyncPollingArgs): void {
  const onSyncRef = useRef(onSync);
  const inFlightRef = useRef(false);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (!enabled || intervalSeconds == null) return;

    let cancelled = false;
    const activeContextKey = contextKey;
    const run = () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      void onSyncRef
        .current()
        .catch((error) => {
          console.error(`Automatic sync failed for ${activeContextKey}:`, error);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const timer = window.setInterval(run, intervalSeconds * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalSeconds, contextKey]);
}
