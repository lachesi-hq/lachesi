use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::config;
use crate::local_repo::{configured_repo_path, git_origin_matches};

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepositoryWorktreeStatus {
    Clean,
    Dirty,
    MissingPath,
    InvalidRepo,
    Error,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepositoryBranchKind {
    Local,
    Remote,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryBranchOption {
    pub name: String,
    pub reference: String,
    pub kind: RepositoryBranchKind,
    pub is_current: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryWorktreeState {
    pub workspace: String,
    pub repo: String,
    pub local_path: Option<String>,
    pub status: RepositoryWorktreeStatus,
    pub current_branch: Option<String>,
    pub detached_head: Option<String>,
    pub dirty: bool,
    pub branches: Vec<RepositoryBranchOption>,
    pub error: Option<String>,
}

fn git_command(repo_path: &Path) -> Command {
    let mut cmd = Command::new("/usr/bin/git");
    cmd.current_dir(repo_path);
    cmd
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<(Option<i32>, String, String), String> {
    let output = git_command(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git {}: {e}", args.join(" ")))?;
    Ok((
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

fn run_git_checked(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let (code, stdout, stderr) = run_git(repo_path, args)?;
    if code == Some(0) {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!(
            "git {} failed with code {:?}: {}{}",
            args.join(" "),
            code,
            stderr.trim(),
            if stdout.trim().is_empty() {
                String::new()
            } else {
                format!("\nstdout: {}", stdout.trim())
            }
        ))
    }
}

fn is_git_repo(repo_path: &Path) -> bool {
    run_git(repo_path, &["rev-parse", "--is-inside-work-tree"])
        .map(|(code, stdout, _)| code == Some(0) && stdout.trim() == "true")
        .unwrap_or(false)
}

fn current_branch(repo_path: &Path) -> Result<(Option<String>, Option<String>), String> {
    let symbolic = run_git(repo_path, &["symbolic-ref", "--short", "HEAD"])?;
    if symbolic.0 == Some(0) {
        return Ok((Some(symbolic.1.trim().to_string()), None));
    }
    let head = run_git_checked(repo_path, &["rev-parse", "--short", "HEAD"])?;
    Ok((None, Some(head)))
}

fn dirty(repo_path: &Path) -> Result<bool, String> {
    Ok(!run_git_checked(repo_path, &["status", "--porcelain"])?.is_empty())
}

fn branch_refs(repo_path: &Path, args: &[&str]) -> Result<Vec<String>, String> {
    Ok(run_git_checked(repo_path, args)?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

fn list_branch_options(
    repo_path: &Path,
    current: Option<&str>,
) -> Result<Vec<RepositoryBranchOption>, String> {
    let mut options = Vec::new();
    for branch in branch_refs(repo_path, &["branch", "--format=%(refname:short)"])? {
        options.push(RepositoryBranchOption {
            is_current: current == Some(branch.as_str()),
            reference: branch.clone(),
            name: branch,
            kind: RepositoryBranchKind::Local,
        });
    }
    for branch in branch_refs(repo_path, &["branch", "-r", "--format=%(refname:short)"])? {
        if branch == "origin/HEAD" || branch.starts_with("origin/HEAD ->") {
            continue;
        }
        options.push(RepositoryBranchOption {
            is_current: false,
            reference: branch.clone(),
            name: branch,
            kind: RepositoryBranchKind::Remote,
        });
    }
    options.sort_by(|left, right| left.reference.cmp(&right.reference));
    options.dedup_by(|left, right| left.reference == right.reference);
    Ok(options)
}

fn state_for_repo(
    workspace: String,
    repo: String,
    local_path: Option<PathBuf>,
) -> RepositoryWorktreeState {
    let Some(path) = local_path else {
        return RepositoryWorktreeState {
            workspace,
            repo,
            local_path: None,
            status: RepositoryWorktreeStatus::MissingPath,
            current_branch: None,
            detached_head: None,
            dirty: false,
            branches: Vec::new(),
            error: Some("No local path configured in Settings.".to_string()),
        };
    };
    let path_string = path.display().to_string();
    if !path.is_dir() {
        return RepositoryWorktreeState {
            workspace,
            repo,
            local_path: Some(path_string),
            status: RepositoryWorktreeStatus::MissingPath,
            current_branch: None,
            detached_head: None,
            dirty: false,
            branches: Vec::new(),
            error: Some("Configured local path does not exist or is not a directory.".to_string()),
        };
    }
    if !is_git_repo(&path) {
        return RepositoryWorktreeState {
            workspace,
            repo,
            local_path: Some(path_string),
            status: RepositoryWorktreeStatus::InvalidRepo,
            current_branch: None,
            detached_head: None,
            dirty: false,
            branches: Vec::new(),
            error: Some("Configured local path is not a git repository.".to_string()),
        };
    }
    if git_origin_matches(&path, &workspace, &repo).ok() != Some(true) {
        let error =
            format!("Configured local path does not match bitbucket.org/{workspace}/{repo}.");
        return RepositoryWorktreeState {
            workspace,
            repo,
            local_path: Some(path_string),
            status: RepositoryWorktreeStatus::InvalidRepo,
            current_branch: None,
            detached_head: None,
            dirty: false,
            branches: Vec::new(),
            error: Some(error),
        };
    }

    match current_branch(&path).and_then(|(branch, detached)| {
        let is_dirty = dirty(&path)?;
        let branches = list_branch_options(&path, branch.as_deref())?;
        Ok((branch, detached, is_dirty, branches))
    }) {
        Ok((current_branch, detached_head, is_dirty, branches)) => RepositoryWorktreeState {
            workspace,
            repo,
            local_path: Some(path_string),
            status: if is_dirty {
                RepositoryWorktreeStatus::Dirty
            } else {
                RepositoryWorktreeStatus::Clean
            },
            current_branch,
            detached_head,
            dirty: is_dirty,
            branches,
            error: None,
        },
        Err(error) => RepositoryWorktreeState {
            workspace,
            repo,
            local_path: Some(path_string),
            status: RepositoryWorktreeStatus::Error,
            current_branch: None,
            detached_head: None,
            dirty: false,
            branches: Vec::new(),
            error: Some(error),
        },
    }
}

fn local_branch_for_remote(reference: &str) -> Option<&str> {
    reference
        .strip_prefix("origin/")
        .filter(|branch| !branch.is_empty())
}

fn checkout_branch(repo_path: &Path, branch_ref: &str) -> Result<(), String> {
    if branch_ref.trim().is_empty() {
        return Err("Choose a branch before checking out.".to_string());
    }
    if dirty(repo_path)? {
        return Err("Cannot checkout while the repository has uncommitted changes.".to_string());
    }
    if let Some(local_branch) = local_branch_for_remote(branch_ref) {
        let local_exists = run_git(
            repo_path,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/heads/{local_branch}"),
            ],
        )?
        .0 == Some(0);
        if local_exists {
            run_git_checked(repo_path, &["checkout", local_branch])?;
        } else {
            run_git_checked(repo_path, &["checkout", "--track", branch_ref])?;
        }
        return Ok(());
    }
    run_git_checked(repo_path, &["checkout", branch_ref])?;
    Ok(())
}

fn configured_repo(workspace: &str, repo: &str) -> Result<PathBuf, String> {
    let cfg = config::load();
    let repo_ref = cfg
        .repos
        .iter()
        .find(|candidate| candidate.workspace == workspace && candidate.repo == repo)
        .ok_or_else(|| format!("Repository {workspace}/{repo} is not configured."))?;
    let repo_path = configured_repo_path(repo_ref)
        .ok_or_else(|| format!("Repository {workspace}/{repo} has no local path configured."))?;
    if git_origin_matches(&repo_path, workspace, repo)? != true {
        return Err(format!(
            "Configured local path does not match bitbucket.org/{workspace}/{repo}."
        ));
    }
    Ok(repo_path)
}

fn fetch_repo(repo_path: &Path) -> Result<(), String> {
    run_git_checked(repo_path, &["fetch", "--prune", "origin"])?;
    Ok(())
}

fn pull_repo(repo_path: &Path) -> Result<(), String> {
    if dirty(repo_path)? {
        return Err("Cannot pull while the repository has uncommitted changes.".to_string());
    }
    run_git_checked(repo_path, &["pull", "--ff-only"])?;
    Ok(())
}

#[tauri::command]
pub fn list_repository_worktrees() -> Result<Vec<RepositoryWorktreeState>, String> {
    let cfg = config::load();
    Ok(cfg
        .repos
        .into_iter()
        .map(|repo_ref| {
            let path = configured_repo_path(&repo_ref);
            state_for_repo(repo_ref.workspace, repo_ref.repo, path)
        })
        .collect())
}

#[tauri::command]
pub fn checkout_repository_branch(
    workspace: String,
    repo: String,
    branch_ref: String,
) -> Result<RepositoryWorktreeState, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    checkout_branch(&repo_path, &branch_ref)?;
    Ok(state_for_repo(workspace, repo, Some(repo_path)))
}

#[tauri::command]
pub fn fetch_repository(
    workspace: String,
    repo: String,
) -> Result<RepositoryWorktreeState, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    fetch_repo(&repo_path)?;
    Ok(state_for_repo(workspace, repo, Some(repo_path)))
}

#[tauri::command]
pub fn pull_repository(workspace: String, repo: String) -> Result<RepositoryWorktreeState, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    pull_repo(&repo_path)?;
    Ok(state_for_repo(workspace, repo, Some(repo_path)))
}

#[cfg(test)]
mod tests {
    use super::local_branch_for_remote;

    #[test]
    fn maps_origin_remote_to_local_branch_name() {
        assert_eq!(
            local_branch_for_remote("origin/feature/test"),
            Some("feature/test")
        );
        assert_eq!(local_branch_for_remote("main"), None);
        assert_eq!(local_branch_for_remote("upstream/main"), None);
    }
}
