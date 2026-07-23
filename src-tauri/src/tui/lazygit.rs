use std::path::{Path, PathBuf};
use std::process::Command;

use crate::config::RepoRef;
use crate::local_repo::resolve_local_repo;

const COMMON_LAZYGIT_PATHS: &[&str] = &[
    "/opt/homebrew/bin/lazygit",
    "/usr/local/bin/lazygit",
    "/usr/bin/lazygit",
];

pub fn run_for_repo(repo: &RepoRef, branch: Option<&str>) -> Result<(), String> {
    let repo_path = resolve_local_repo(&repo.workspace, &repo.repo)?;
    if let Some(branch) = branch.map(str::trim).filter(|branch| !branch.is_empty()) {
        checkout_pr_branch(&repo_path, branch)?;
    }
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

fn checkout_pr_branch(repo_path: &Path, branch: &str) -> Result<(), String> {
    if current_branch(repo_path)? == branch {
        return Ok(());
    }
    if dirty(repo_path)? {
        return Err(format!(
            "Cannot open lazygit on PR branch `{branch}` because the repository has uncommitted changes. Commit or stash them first."
        ));
    }
    if ref_exists(repo_path, &format!("refs/heads/{branch}"))? {
        return run_git_checked(repo_path, &["checkout", branch]).map(|_| ());
    }

    let refspec = format!("refs/heads/{branch}:refs/remotes/origin/{branch}");
    let fetch_error = run_git_checked(repo_path, &["fetch", "origin", &refspec]).err();
    let remote_branch = format!("origin/{branch}");
    if ref_exists(repo_path, &format!("refs/remotes/{remote_branch}"))? {
        return run_git_checked(repo_path, &["checkout", "--track", &remote_branch]).map(|_| ());
    }

    match run_git_checked(repo_path, &["checkout", branch]) {
        Ok(_) => Ok(()),
        Err(checkout_error) => {
            let fetch_note = fetch_error
                .map(|error| format!(" Fetch failed: {error}"))
                .unwrap_or_default();
            Err(format!(
                "Could not checkout PR branch `{branch}` before opening lazygit.{fetch_note} Checkout failed: {checkout_error}"
            ))
        }
    }
}

fn current_branch(repo_path: &Path) -> Result<String, String> {
    Ok(
        run_git_checked(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?
            .trim()
            .to_string(),
    )
}

fn dirty(repo_path: &Path) -> Result<bool, String> {
    Ok(!run_git_checked(repo_path, &["status", "--porcelain"])?.is_empty())
}

fn ref_exists(repo_path: &Path, reference: &str) -> Result<bool, String> {
    Ok(run_git(repo_path, &["rev-parse", "--verify", reference])?.0 == Some(0))
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<(Option<i32>, String, String), String> {
    let output = Command::new("/usr/bin/git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;
    Ok((
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

fn run_git_checked(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let (code, stdout, stderr) = run_git(repo_path, args)?;
    if code == Some(0) {
        return Ok(stdout);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "lachesi-lazygit-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn init_repo() -> PathBuf {
        let path = temp_repo_path("repo");
        fs::create_dir_all(&path).expect("create repo");
        run_git_checked(&path, &["init"]).expect("git init");
        run_git_checked(&path, &["config", "user.email", "lachesi@example.test"])
            .expect("git config email");
        run_git_checked(&path, &["config", "user.name", "Lachesi Test"]).expect("git config name");
        fs::write(path.join("README.md"), "initial\n").expect("write readme");
        run_git_checked(&path, &["add", "README.md"]).expect("git add");
        run_git_checked(&path, &["commit", "-m", "Initial commit"]).expect("git commit");
        path
    }

    #[test]
    fn missing_lazygit_status_is_reported() {
        let error = run_lazygit_command(
            Path::new("/definitely/not/lazygit"),
            Path::new("/definitely/not/a/repo"),
        )
        .expect_err("missing binary should fail");

        assert!(error.contains("failed to start lazygit"));
    }

    #[test]
    fn checks_out_existing_pull_request_branch_before_lazygit() {
        let repo = init_repo();
        run_git_checked(&repo, &["checkout", "-b", "feature/pr"]).expect("create branch");
        run_git_checked(&repo, &["checkout", "main"])
            .or_else(|_| run_git_checked(&repo, &["checkout", "master"]))
            .expect("checkout default branch");

        checkout_pr_branch(&repo, "feature/pr").expect("checkout PR branch");

        assert_eq!(current_branch(&repo).expect("current branch"), "feature/pr");
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn dirty_worktree_blocks_pull_request_branch_checkout() {
        let repo = init_repo();
        run_git_checked(&repo, &["checkout", "-b", "feature/pr"]).expect("create branch");
        run_git_checked(&repo, &["checkout", "main"])
            .or_else(|_| run_git_checked(&repo, &["checkout", "master"]))
            .expect("checkout default branch");
        fs::write(repo.join("README.md"), "dirty\n").expect("dirty readme");

        let error = checkout_pr_branch(&repo, "feature/pr").expect_err("dirty should block");

        assert!(error.contains("uncommitted changes"));
        assert_ne!(current_branch(&repo).expect("current branch"), "feature/pr");
        let _ = fs::remove_dir_all(repo);
    }
}
