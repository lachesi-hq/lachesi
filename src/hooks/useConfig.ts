import { useCallback, useEffect, useState } from "react";
import { tauriCall } from "@/lib/tauri";
import type {
  AppConfig,
  ClaudeReviewEffort,
  ClaudeReviewModel,
  DiffViewMode,
  RepoRef,
  ReviewTerminal,
} from "@/types";

export type SaveConfigInput = {
  repos: RepoRef[];
  defaultDiffView: DiffViewMode;
  theme: "light" | "dark";
  reviewTerminal: ReviewTerminal | null;
  claudeModel: ClaudeReviewModel | null;
  claudeEffort: ClaudeReviewEffort | null;
  jiraBaseUrl: string | null;
  menuBarSyncEnabled: boolean;
  notificationsEnabled: boolean;
};

interface UseConfigResult {
  config: AppConfig | null;
  loading: boolean;
  reload: () => Promise<void>;
  saveConfig: (input: SaveConfigInput) => Promise<void>;
}

/** Loads and persists the non-secret app configuration via IPC. */
export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await tauriCall<AppConfig>("load_config"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveConfig = useCallback(
    async (input: SaveConfigInput) => {
      await tauriCall<void>("save_config", input);
      await reload();
    },
    [reload],
  );

  return { config, loading, reload, saveConfig };
}
