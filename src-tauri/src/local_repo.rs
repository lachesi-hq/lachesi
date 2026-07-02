use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::{self, RepoRef, ReviewProvider};

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    ".next",
    ".cache",
    ".venv",
    "venv",
    "Library",
    "Applications",
];

fn matches_remote(
    config_contents: &str,
    provider: ReviewProvider,
    workspace: &str,
    repo: &str,
) -> bool {
    let lower = config_contents.to_lowercase();
    let ws = workspace.to_lowercase();
    let rp = repo.to_lowercase();
    match provider {
        ReviewProvider::Bitbucket => {
            lower.contains(&format!("bitbucket.org/{ws}/{rp}"))
                || lower.contains(&format!("bitbucket.org:{ws}/{rp}"))
        }
        ReviewProvider::Github => {
            lower.contains(&format!("github.com/{ws}/{rp}"))
                || lower.contains(&format!("github.com:{ws}/{rp}"))
        }
    }
}

fn search_dir(
    dir: &Path,
    provider: ReviewProvider,
    workspace: &str,
    repo: &str,
    depth: u32,
) -> Option<PathBuf> {
    let git_config = dir.join(".git").join("config");
    if git_config.is_file() {
        if let Ok(contents) = fs::read_to_string(&git_config) {
            if matches_remote(&contents, provider, workspace, repo) {
                return Some(dir.to_path_buf());
            }
        }
        return None;
    }
    if depth == 0 {
        return None;
    }
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.is_empty() || name.starts_with('.') || SKIP_DIRS.contains(&name) {
            continue;
        }
        if let Some(found) = search_dir(&path, provider, workspace, repo, depth - 1) {
            return Some(found);
        }
    }
    None
}

pub fn autodiscover_local_repo(
    provider: ReviewProvider,
    workspace: &str,
    repo: &str,
) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let roots = [
        "dev",
        "code",
        "projects",
        "work",
        "src",
        "Developer",
        "repos",
        "git",
        "Sites",
        "Documents",
    ];
    for root in roots {
        let dir = home.join(root);
        if dir.is_dir() {
            if let Some(found) = search_dir(&dir, provider, workspace, repo, 5) {
                return Some(found);
            }
        }
    }
    None
}

pub fn git_origin_matches(
    path: &Path,
    provider: ReviewProvider,
    workspace: &str,
    repo: &str,
) -> Result<bool, String> {
    let output = Command::new("/usr/bin/git")
        .arg("-C")
        .arg(path)
        .arg("remote")
        .arg("get-url")
        .arg("origin")
        .output()
        .map_err(|e| format!("failed to inspect git remote for {}: {e}", path.display()))?;
    if !output.status.success() {
        return Ok(false);
    }
    let remote = String::from_utf8_lossy(&output.stdout);
    Ok(matches_remote(&remote, provider, workspace, repo))
}

pub fn configured_repo_path(repo_ref: &RepoRef) -> Option<PathBuf> {
    repo_ref
        .local_path
        .as_ref()
        .map(|path| PathBuf::from(path.trim()))
        .filter(|path| !path.as_os_str().is_empty())
}

pub fn configured_or_discovered_repo(workspace: &str, repo: &str) -> Option<PathBuf> {
    let cfg = config::load();
    if let Some(repo_ref) = cfg
        .repos
        .iter()
        .find(|candidate| candidate.workspace == workspace && candidate.repo == repo)
    {
        if let Some(path) = configured_repo_path(repo_ref) {
            if path.is_dir()
                && git_origin_matches(&path, repo_ref.provider, workspace, repo).ok() == Some(true)
            {
                return Some(path);
            }
        }
    }
    autodiscover_local_repo(cfg.review_provider, workspace, repo)
}

pub fn resolve_local_repo(workspace: &str, repo: &str) -> Result<PathBuf, String> {
    let cfg = config::load();
    let configured = cfg
        .repos
        .iter()
        .find(|candidate| candidate.workspace == workspace && candidate.repo == repo);
    let provider = configured
        .map(|candidate| candidate.provider)
        .unwrap_or(cfg.review_provider);
    let configured = configured.and_then(configured_repo_path);
    let mut configured_error = None;

    if let Some(path) = configured {
        if !path.is_dir() {
            configured_error = Some(format!(
                "Configured local path does not exist or is not a directory: {}.",
                path.display()
            ));
        } else if git_origin_matches(&path, provider, workspace, repo)? {
            return Ok(path);
        } else {
            configured_error = Some(format!(
                "Configured local path does not match {}: {}.",
                remote_label(provider, workspace, repo),
                path.display()
            ));
        }
    }

    if let Some(found) = autodiscover_local_repo(provider, workspace, repo) {
        return Ok(found);
    }

    Err(match configured_error {
        Some(message) => format!("{message} No matching local clone was auto-discovered."),
        None => format!(
            "No local clone found for {}. Configure a local path in Settings or clone the repo under a scanned directory.",
            remote_label(provider, workspace, repo)
        ),
    })
}

fn remote_label(provider: ReviewProvider, workspace: &str, repo: &str) -> String {
    match provider {
        ReviewProvider::Bitbucket => format!("bitbucket.org/{workspace}/{repo}"),
        ReviewProvider::Github => format!("github.com/{workspace}/{repo}"),
    }
}

pub fn find_in_path(bin: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|dir| dir.join(bin))
        .find(|candidate| {
            fs::metadata(candidate)
                .map(|meta| meta.is_file())
                .unwrap_or(false)
        })
}
