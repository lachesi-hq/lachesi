import { useCallback } from "react";
import { tauriCall } from "@/lib/tauri";

export interface ConnectionUser {
  displayName: string;
}

interface UseCredentialsResult {
  testConnection: (username: string, token: string) => Promise<ConnectionUser>;
  saveCredentials: (username: string, token: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
  saveJiraToken: (token: string) => Promise<void>;
  saveNotionToken: (token: string) => Promise<void>;
}

/** Credential operations: validate, persist (keychain), and clear. */
export function useCredentials(): UseCredentialsResult {
  const testConnection = useCallback(
    (username: string, token: string) =>
      tauriCall<ConnectionUser>("test_connection", { username, token }),
    [],
  );

  const saveCredentials = useCallback(
    (username: string, token: string) => tauriCall<void>("save_credentials", { username, token }),
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

  return { testConnection, saveCredentials, clearCredentials, saveJiraToken, saveNotionToken };
}
