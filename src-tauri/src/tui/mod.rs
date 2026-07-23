mod lazygit;
mod render;
mod terminal;

use std::time::Duration;

use crossterm::event::{self, Event, KeyCode};

use crate::config::{self, RepoRef};
use crate::services::bitbucket::{
    get_pr_diff_native, get_pull_request_native, list_comments_native, list_pull_requests_native,
    ListPrOptions, PrComment, PullRequestDetail, PullRequestSummary,
};
use render::{render, FocusPane, TuiState};
use terminal::TerminalGuard;

const TICK_RATE: Duration = Duration::from_millis(250);

pub fn run_from_env() -> Result<(), String> {
    let config = config::load();
    let mut app = TuiApp::from_repos(config.repos);
    app.load_selected_repo();
    let mut terminal = TerminalGuard::enter().map_err(|error| error.to_string())?;

    loop {
        terminal
            .draw(|frame| render(frame, app.view_state()))
            .map_err(|error| error.to_string())?;

        if app.should_quit || terminal.interrupted() {
            break;
        }

        if event::poll(TICK_RATE).map_err(|error| error.to_string())? {
            match event::read().map_err(|error| error.to_string())? {
                Event::Key(key) if key.code == KeyCode::Char('g') => {
                    let result = terminal
                        .suspend(|| app.run_lazygit())
                        .map_err(|error| error.to_string())?;
                    app.finish_external_action(result);
                }
                Event::Key(key) => app.handle_key(key.code),
                Event::Resize(_, _) => {}
                _ => {}
            }
        }
    }

    Ok(())
}

struct TuiApp {
    repos: Vec<RepoRef>,
    selected_repo: usize,
    focus: FocusPane,
    pull_requests: Vec<PullRequestSummary>,
    selected_pr: usize,
    detail: Option<PullRequestDetail>,
    comments: Vec<PrComment>,
    diff: Option<String>,
    error: Option<String>,
    status: String,
    should_quit: bool,
}

impl TuiApp {
    fn from_repos(repos: Vec<RepoRef>) -> Self {
        Self {
            repos,
            selected_repo: 0,
            focus: FocusPane::Repositories,
            pull_requests: Vec::new(),
            selected_pr: 0,
            detail: None,
            comments: Vec::new(),
            diff: None,
            error: None,
            status: "Ready".to_string(),
            should_quit: false,
        }
    }

    fn handle_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Char('q') | KeyCode::Esc => self.should_quit = true,
            KeyCode::Tab => self.toggle_focus(),
            KeyCode::Enter => self.load_selected_pr(),
            KeyCode::Char('r') => self.load_selected_repo(),
            KeyCode::Down | KeyCode::Char('j') => self.select_next(),
            KeyCode::Up | KeyCode::Char('k') => self.select_previous(),
            _ => {}
        }
    }

    fn toggle_focus(&mut self) {
        self.focus = match self.focus {
            FocusPane::Repositories => FocusPane::PullRequests,
            FocusPane::PullRequests => FocusPane::Repositories,
        };
    }

    fn select_next(&mut self) {
        match self.focus {
            FocusPane::Repositories => self.select_next_repo(),
            FocusPane::PullRequests => self.select_next_pr(),
        }
    }

    fn select_previous(&mut self) {
        match self.focus {
            FocusPane::Repositories => self.select_previous_repo(),
            FocusPane::PullRequests => self.select_previous_pr(),
        }
    }

    fn select_next_repo(&mut self) {
        if self.repos.is_empty() {
            self.selected_repo = 0;
            return;
        }
        let previous = self.selected_repo;
        self.selected_repo = (self.selected_repo + 1).min(self.repos.len() - 1);
        if self.selected_repo != previous {
            self.load_selected_repo();
        }
    }

    fn select_previous_repo(&mut self) {
        let previous = self.selected_repo;
        self.selected_repo = self.selected_repo.saturating_sub(1);
        if self.selected_repo != previous {
            self.load_selected_repo();
        }
    }

    fn select_next_pr(&mut self) {
        if self.pull_requests.is_empty() {
            self.selected_pr = 0;
            return;
        }
        self.selected_pr = (self.selected_pr + 1).min(self.pull_requests.len() - 1);
    }

    fn select_previous_pr(&mut self) {
        self.selected_pr = self.selected_pr.saturating_sub(1);
    }

    fn load_selected_repo(&mut self) {
        let Some(repo) = self.repos.get(self.selected_repo) else {
            self.pull_requests.clear();
            self.detail = None;
            self.comments.clear();
            self.diff = None;
            self.status = "No repositories configured".to_string();
            return;
        };
        let provider = repo.provider;
        let workspace = repo.workspace.clone();
        let repo_name = repo.repo.clone();
        self.status = format!("Loading open PRs for {workspace}/{repo_name}...");
        self.error = None;
        let opts = ListPrOptions {
            state: Some("OPEN".to_string()),
            page: Some(1),
            pagelen: Some(50),
            query: None,
            updated_after: None,
        };
        match list_pull_requests_native(
            Some(provider),
            workspace.as_str(),
            repo_name.as_str(),
            &opts,
        ) {
            Ok(page) => {
                self.pull_requests = page.values;
                self.selected_pr = 0;
                self.detail = None;
                self.comments.clear();
                self.diff = None;
                self.status = format!("Loaded {} open PRs", self.pull_requests.len());
                if !self.pull_requests.is_empty() {
                    self.load_selected_pr();
                }
            }
            Err(error) => {
                self.pull_requests.clear();
                self.detail = None;
                self.comments.clear();
                self.diff = None;
                self.error = Some(error);
                self.status = "Failed to load PRs".to_string();
            }
        }
    }

    fn load_selected_pr(&mut self) {
        let Some(repo) = self.repos.get(self.selected_repo) else {
            return;
        };
        let Some(pr) = self.pull_requests.get(self.selected_pr) else {
            self.detail = None;
            self.comments.clear();
            self.diff = None;
            return;
        };
        let provider = repo.provider;
        let workspace = repo.workspace.clone();
        let repo_name = repo.repo.clone();
        let pr_id = pr.id;
        self.status = format!("Loading PR #{pr_id}...");
        self.error = None;
        match get_pull_request_native(
            Some(provider),
            workspace.as_str(),
            repo_name.as_str(),
            pr_id,
        ) {
            Ok(detail) => {
                self.comments = list_comments_native(
                    Some(provider),
                    workspace.as_str(),
                    repo_name.as_str(),
                    pr_id,
                )
                .unwrap_or_else(|error| {
                    self.error = Some(format!("Comments failed: {error}"));
                    Vec::new()
                });
                self.diff = get_pr_diff_native(
                    Some(provider),
                    workspace.as_str(),
                    repo_name.as_str(),
                    pr_id,
                )
                .map_err(|error| {
                    self.error = Some(format!("Diff failed: {error}"));
                })
                .ok();
                self.detail = Some(detail);
                self.status = format!("Loaded PR #{pr_id}");
            }
            Err(error) => {
                self.detail = None;
                self.comments.clear();
                self.diff = None;
                self.error = Some(error);
                self.status = "Failed to load PR detail".to_string();
            }
        }
    }

    fn run_lazygit(&self) -> Result<(), String> {
        let Some(repo) = self.repos.get(self.selected_repo) else {
            return Err("No repository selected.".to_string());
        };
        lazygit::run_for_repo(repo)
    }

    fn finish_external_action(&mut self, result: Result<(), String>) {
        match result {
            Ok(()) => {
                self.status = "Returned from lazygit".to_string();
                self.error = None;
            }
            Err(error) => {
                self.status = "Failed to launch lazygit".to_string();
                self.error = Some(error);
            }
        }
    }

    fn view_state(&self) -> TuiState<'_> {
        TuiState {
            repos: &self.repos,
            selected_repo: self.selected_repo,
            focus: self.focus,
            pull_requests: &self.pull_requests,
            selected_pr: self.selected_pr,
            detail: self.detail.as_ref(),
            comments: &self.comments,
            diff: self.diff.as_deref(),
            error: self.error.as_deref(),
            status: self.status.as_str(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ReviewProvider;

    fn repo(workspace: &str, repo: &str) -> RepoRef {
        RepoRef {
            provider: ReviewProvider::Github,
            workspace: workspace.to_string(),
            repo: repo.to_string(),
            local_path: None,
        }
    }

    #[test]
    fn repo_selection_stays_in_bounds() {
        let mut app = TuiApp::from_repos(vec![repo("lachesi-hq", "lachesi")]);
        app.pull_requests.clear();

        app.handle_key(KeyCode::Down);
        assert_eq!(app.selected_repo, 0);

        app.handle_key(KeyCode::Up);
        assert_eq!(app.selected_repo, 0);
    }

    #[test]
    fn quit_keys_mark_app_done() {
        let mut app = TuiApp::from_repos(Vec::new());

        app.handle_key(KeyCode::Char('q'));

        assert!(app.should_quit);
    }

    #[test]
    fn lazygit_without_selected_repo_is_reported() {
        let app = TuiApp::from_repos(Vec::new());

        let error = app.run_lazygit().expect_err("missing repo should fail");

        assert_eq!(error, "No repository selected.");
    }

    #[test]
    fn external_action_error_updates_status() {
        let mut app = TuiApp::from_repos(Vec::new());

        app.finish_external_action(Err("missing lazygit".to_string()));

        assert_eq!(app.status, "Failed to launch lazygit");
        assert_eq!(app.error.as_deref(), Some("missing lazygit"));
    }
}
