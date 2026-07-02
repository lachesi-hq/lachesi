import { useCallback } from "react";
import { tauriCall } from "@/lib/tauri";
import type { ReviewProvider } from "@/types";

export interface ConnectionUser {
  displayName: string;
}

interface UseCredentialsResult {
  testConnection: (
    provider: ReviewProvider,
    username: string,
    token: string,
  ) => Promise<ConnectionUser>;
  saveCredentials: (username: string, token: string) => Promise<void>;
  saveGithubToken: (token: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
  saveJiraToken: (token: string) => Promise<void>;
  saveNotionToken: (token: string) => Promise<void>;
}

/** Credential operations: validate, persist (keychain), and clear. */
export function useCredentials(): UseCredentialsResult {
  const testConnection = useCallback(
    (provider: ReviewProvider, username: string, token: string) =>
      tauriCall<ConnectionUser>("test_connection", { provider, username, token }),
    [],
  );

  const saveCredentials = useCallback(
    (username: string, token: string) => tauriCall<void>("save_credentials", { username, token }),
    [],
  );

  const saveGithubToken = useCallback(
    (token: string) => tauriCall<void>("save_github_token", { token }),
    [],
  );

  const clearCredentials = useCallback(() => tauriCall<void>("clear_credentials"), []);

  const saveJiraToken = useCallback(
    (token: string) => tauriCall<void>("save_jira_token", { token }),
    [],
  );

  const saveNotionToken = useCallback(
    (token: string) => tauriCall<void>("save_notion_token", { token }),
    [],
  );

  return {
    testConnection,
    saveCredentials,
    saveGithubToken,
    clearCredentials,
    saveJiraToken,
    saveNotionToken,
  };
}
