import { tauriCall } from "@/lib/tauri";
import type {
  RepositoryBlameLine,
  RepositoryFileContent,
  RepositoryFileDiff,
  RepositoryFileEntry,
  RepositoryWorktreeState,
} from "@/types";

interface RepositoryFileInput {
  workspace: string;
  repo: string;
  path: string;
}

export interface OpenRepositoryFileExternalInput extends RepositoryFileInput {
  line: number | null;
}

export interface CheckoutRepositoryBranchInput {
  workspace: string;
  repo: string;
  branchRef: string;
}

export interface RepositoryWorktreeInput {
  workspace: string;
  repo: string;
}

export function listRepositoryFiles(
  workspace: string,
  repo: string,
): Promise<RepositoryFileEntry[]> {
  return tauriCall<RepositoryFileEntry[]>("list_repository_files", { workspace, repo });
}

export function readRepositoryFile(input: RepositoryFileInput): Promise<RepositoryFileContent> {
  return tauriCall<RepositoryFileContent>("read_repository_file", {
    workspace: input.workspace,
    repo: input.repo,
    path: input.path,
  });
}

export function getRepositoryFileDiff(input: RepositoryFileInput): Promise<RepositoryFileDiff> {
  return tauriCall<RepositoryFileDiff>("get_repository_file_diff", {
    workspace: input.workspace,
    repo: input.repo,
    path: input.path,
  });
}

export function getRepositoryFileBlame(input: RepositoryFileInput): Promise<RepositoryBlameLine[]> {
  return tauriCall<RepositoryBlameLine[]>("get_repository_file_blame", {
    workspace: input.workspace,
    repo: input.repo,
    path: input.path,
  });
}

export function openRepositoryFileExternal(input: OpenRepositoryFileExternalInput): Promise<void> {
  return tauriCall<void>("open_repository_file_external", {
    workspace: input.workspace,
    repo: input.repo,
    path: input.path,
    line: input.line,
  });
}

export function listRepositoryWorktrees(): Promise<RepositoryWorktreeState[]> {
  return tauriCall<RepositoryWorktreeState[]>("list_repository_worktrees");
}

export function checkoutRepositoryBranch(
  input: CheckoutRepositoryBranchInput,
): Promise<RepositoryWorktreeState> {
  return tauriCall<RepositoryWorktreeState>("checkout_repository_branch", {
    workspace: input.workspace,
    repo: input.repo,
    branchRef: input.branchRef,
  });
}

export function fetchRepository(input: RepositoryWorktreeInput): Promise<RepositoryWorktreeState> {
  return tauriCall<RepositoryWorktreeState>("fetch_repository", {
    workspace: input.workspace,
    repo: input.repo,
  });
}

export function pullRepository(input: RepositoryWorktreeInput): Promise<RepositoryWorktreeState> {
  return tauriCall<RepositoryWorktreeState>("pull_repository", {
    workspace: input.workspace,
    repo: input.repo,
  });
}

export function stashRepository(input: RepositoryWorktreeInput): Promise<RepositoryWorktreeState> {
  return tauriCall<RepositoryWorktreeState>("stash_repository", {
    workspace: input.workspace,
    repo: input.repo,
  });
}
