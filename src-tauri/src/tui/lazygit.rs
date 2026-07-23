use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::RepoRef;
use crate::local_repo::resolve_local_repo;

const COMMON_LAZYGIT_PATHS: &[&str] = &[
    "/opt/homebrew/bin/lazygit",
    "/usr/local/bin/lazygit",
    "/usr/bin/lazygit",
];

pub fn run_for_repo(repo: &RepoRef) -> Result<(), String> {
    let repo_path = resolve_local_repo(&repo.workspace, &repo.repo)?;
    let lazygit = find_lazygit().ok_or_else(|| {
        "lazygit was not found in PATH. Install lazygit or add it to PATH.".to_string()
    })?;
    run_lazygit_command(&lazygit, &repo_path)
}

fn find_lazygit() -> Option<PathBuf> {
    crate::local_repo::find_in_path("lazygit").or_else(|| {
        COMMON_LAZYGIT_PATHS
            .iter()
            .map(PathBuf::from)
            .find(|path| path.is_file())
    })
}

fn run_lazygit_command(lazygit: &Path, repo_path: &Path) -> Result<(), String> {
    let status = Command::new(lazygit)
        .current_dir(repo_path)
        .status()
        .map_err(|error| format!("failed to start lazygit: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("lazygit exited with status {status}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_lazygit_status_is_reported() {
        let error = run_lazygit_command(
            Path::new("/definitely/not/lazygit"),
            Path::new("/definitely/not/a/repo"),
        )
        .expect_err("missing binary should fail");

        assert!(error.contains("failed to start lazygit"));
    }
}
