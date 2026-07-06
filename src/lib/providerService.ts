import { tauriCall } from "@/lib/tauri";
import type { ReviewProvider } from "@/types";

export interface ApprovePullRequestInput {
  provider: ReviewProvider;
  workspace: string;
  repo: string;
  id: number;
}

export function approvePullRequest(input: ApprovePullRequestInput): Promise<void> {
  return tauriCall<void>("approve_pull_request", {
    provider: input.provider,
    workspace: input.workspace,
    repo: input.repo,
    id: input.id,
  });
}
