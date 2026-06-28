use std::fs;
use std::path::{Component, Path, PathBuf};
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

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFileEntry {
    pub path: String,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFileContent {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub truncated: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryBlameLine {
    pub line: u32,
    pub sha: String,
    pub short_sha: String,
    pub author: Option<String>,
    pub author_email: Option<String>,
    pub author_time: Option<i64>,
    pub summary: Option<String>,
}

const MAX_REPOSITORY_FILE_BYTES: u64 = 512 * 1024;
const GIT_BLAME_NO_COMMIT_ERROR: &str = "fatal: no such ref: HEAD";
const GIT_BLAME_NO_PATH: &str = "fatal: no such path";

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

fn run_git_checked_raw(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let (code, stdout, stderr) = run_git(repo_path, args)?;
    if code == Some(0) {
        Ok(stdout)
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

fn validate_repo_relative_path(path: &str) -> Result<(), String> {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return Err("Repository file path must be relative.".to_string());
    }
    if path.trim().is_empty() {
        return Err("Repository file path is required.".to_string());
    }
    if candidate.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("Repository file path cannot escape the repository.".to_string());
    }
    Ok(())
}

fn safe_repo_file_path(repo_path: &Path, path: &str) -> Result<PathBuf, String> {
    validate_repo_relative_path(path)?;
    let full_path = repo_path.join(path);
    let canonical_repo = repo_path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve repository path: {e}"))?;
    let canonical_file = full_path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve repository file path: {e}"))?;
    if !canonical_file.starts_with(&canonical_repo) {
        return Err("Repository file path cannot escape the repository.".to_string());
    }
    Ok(canonical_file)
}

fn short_sha(sha: &str) -> String {
    sha.chars().take(8).collect()
}

fn strip_mail_brackets(value: &str) -> String {
    value
        .trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .to_string()
}

fn parse_blame_header(line: &str) -> Option<(String, u32)> {
    let mut parts = line.split_whitespace();
    let sha = parts.next()?;
    if sha.len() < 7 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    let _original_line = parts.next()?.parse::<u32>().ok()?;
    let final_line = parts.next()?.parse::<u32>().ok()?;
    Some((sha.to_string(), final_line))
}

fn parse_git_blame_line_porcelain(output: &str) -> Vec<RepositoryBlameLine> {
    let mut entries = Vec::new();
    let mut current: Option<RepositoryBlameLine> = None;

    for line in output.lines() {
        if let Some((sha, final_line)) = parse_blame_header(line) {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(RepositoryBlameLine {
                line: final_line,
                short_sha: short_sha(&sha),
                sha,
                author: None,
                author_email: None,
                author_time: None,
                summary: None,
            });
            continue;
        }

        let Some(entry) = current.as_mut() else {
            continue;
        };

        if line.starts_with('\t') {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
        } else if let Some(author) = line.strip_prefix("author ") {
            entry.author = Some(author.to_string());
        } else if let Some(author_email) = line.strip_prefix("author-mail ") {
            entry.author_email = Some(strip_mail_brackets(author_email));
        } else if let Some(author_time) = line.strip_prefix("author-time ") {
            entry.author_time = author_time.parse::<i64>().ok();
        } else if let Some(summary) = line.strip_prefix("summary ") {
            entry.summary = Some(summary.to_string());
        }
    }

    if let Some(entry) = current {
        entries.push(entry);
    }

    entries.sort_by_key(|entry| entry.line);
    entries
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
pub fn list_repository_files(
    workspace: String,
    repo: String,
) -> Result<Vec<RepositoryFileEntry>, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    let output = run_git_checked_raw(&repo_path, &["ls-files", "-z", "-co", "--exclude-standard"])?;
    Ok(output
        .split_terminator('\0')
        .filter(|path| !path.is_empty())
        .map(|path| RepositoryFileEntry {
            path: path.to_string(),
        })
        .collect())
}

#[tauri::command]
pub fn read_repository_file(
    workspace: String,
    repo: String,
    path: String,
) -> Result<RepositoryFileContent, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    let file_path = safe_repo_file_path(&repo_path, &path)?;
    let metadata = fs::metadata(&file_path).map_err(|e| format!("Failed to read file: {e}"))?;
    if !metadata.is_file() {
        return Err("Repository path is not a file.".to_string());
    }
    let size = metadata.len();
    if size > MAX_REPOSITORY_FILE_BYTES {
        return Err(format!(
            "File is too large to preview ({} KB limit).",
            MAX_REPOSITORY_FILE_BYTES / 1024
        ));
    }
    let bytes = fs::read(&file_path).map_err(|e| format!("Failed to read file: {e}"))?;
    let content = String::from_utf8(bytes)
        .map_err(|_| "File is not valid UTF-8 and cannot be previewed.".to_string())?;
    Ok(RepositoryFileContent {
        path,
        content,
        size,
        truncated: false,
    })
}

#[tauri::command]
pub fn get_repository_file_blame(
    workspace: String,
    repo: String,
    path: String,
) -> Result<Vec<RepositoryBlameLine>, String> {
    let repo_path = configured_repo(&workspace, &repo)?;
    let _file_path = safe_repo_file_path(&repo_path, &path)?;
    let (code, stdout, stderr) = run_git(&repo_path, &["blame", "--line-porcelain", "--", &path])?;
    if code == Some(0) {
        return Ok(parse_git_blame_line_porcelain(&stdout));
    }

    let trimmed = stderr.trim();
    if trimmed == GIT_BLAME_NO_COMMIT_ERROR || trimmed.contains(GIT_BLAME_NO_PATH) {
        return Ok(Vec::new());
    }

    Err(format!(
        "git blame failed with code {:?}: {}{}",
        code,
        trimmed,
        if stdout.trim().is_empty() {
            String::new()
        } else {
            format!("\nstdout: {}", stdout.trim())
        }
    ))
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
    use super::{
        local_branch_for_remote, parse_git_blame_line_porcelain, validate_repo_relative_path,
    };

    #[test]
    fn maps_origin_remote_to_local_branch_name() {
        assert_eq!(
            local_branch_for_remote("origin/feature/test"),
            Some("feature/test")
        );
        assert_eq!(local_branch_for_remote("main"), None);
        assert_eq!(local_branch_for_remote("upstream/main"), None);
    }

    #[test]
    fn validates_repository_relative_paths() {
        assert!(validate_repo_relative_path("src/App.tsx").is_ok());
        assert!(validate_repo_relative_path("../secrets").is_err());
        assert!(validate_repo_relative_path("/tmp/secrets").is_err());
        assert!(validate_repo_relative_path("").is_err());
    }

    #[test]
    fn parses_git_blame_line_porcelain() {
        let output = r#"6f52c9a1cf5cd075762f13d0b0f8bf8d0f4f3f7d 10 1 1
author Ada Lovelace
author-mail <ada@example.com>
author-time 1710000000
summary Add formatter
filename src/lib/format.ts
	export function formatCurrency() {}
0000000000000000000000000000000000000000 2 2 1
author Not Committed Yet
author-mail <not.committed.yet>
author-time 1710000100
summary Version of src/lib/format.ts from working tree
filename src/lib/format.ts
	return "$0.00";
"#;

        let entries = parse_git_blame_line_porcelain(output);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].line, 1);
        assert_eq!(entries[0].short_sha, "6f52c9a1");
        assert_eq!(entries[0].author.as_deref(), Some("Ada Lovelace"));
        assert_eq!(entries[0].author_email.as_deref(), Some("ada@example.com"));
        assert_eq!(entries[0].author_time, Some(1710000000));
        assert_eq!(entries[0].summary.as_deref(), Some("Add formatter"));
        assert_eq!(entries[1].line, 2);
        assert_eq!(entries[1].short_sha, "00000000");
        assert_eq!(entries[1].author.as_deref(), Some("Not Committed Yet"));
    }
}
