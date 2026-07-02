import { useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type { ReviewProvider } from "@/types";

export interface CurrentUser {
  displayName: string;
  accountId?: string | null;
}

/** Loads the authenticated Bitbucket account (for the "mine" author filter). */
export function useCurrentUser(enabled: boolean, provider: ReviewProvider): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUser(null);
      return;
    }
    let cancelled = false;
    tauriCall<CurrentUser>("get_current_user", { provider })
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, provider]);

  return user;
}

/** Stable identity key for matching a PR author to a user. */
export function authorKey(accountId: string | null | undefined, displayName: string): string {
  return accountId || displayName;
}
