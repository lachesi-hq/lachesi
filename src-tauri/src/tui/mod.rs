mod lazygit;
mod render;
mod terminal;

use std::time::Duration;

use crossterm::event::{self, Event, KeyCode};

use crate::config::{self, RepoRef};
use crate::services::bitbucket::{
    create_general_comment_native, get_pr_diff_native, get_pull_request_native,
    list_comments_native, list_pull_requests_native, ListPrOptions, PrComment, PullRequestDetail,
    PullRequestSummary,
};
use render::{render, DraftComment, FocusPane, TuiState};
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
    drafts: Vec<DraftComment>,
    composer: Option<String>,
    next_draft_id: u64,
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
            drafts: Vec::new(),
            composer: None,
            next_draft_id: 1,
            error: None,
            status: "Ready".to_string(),
            should_quit: false,
        }
    }

    fn handle_key(&mut self, code: KeyCode) {
        if self.composer.is_some() {
            self.handle_composer_key(code);
            return;
        }
        match code {
            KeyCode::Char('q') | KeyCode::Esc => self.should_quit = true,
            KeyCode::Tab => self.toggle_focus(),
            KeyCode::Enter => self.load_selected_pr(),
            KeyCode::Char('c') => self.start_comment_composer(),
            KeyCode::Char('p') => self.publish_drafts(),
            KeyCode::Char('x') => self.discard_drafts(),
            KeyCode::Char('r') => self.load_selected_repo(),
            KeyCode::Down | KeyCode::Char('j') => self.select_next(),
            KeyCode::Up | KeyCode::Char('k') => self.select_previous(),
            _ => {}
        }
    }

    fn handle_composer_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Esc => {
                self.composer = None;
                self.status = "Comment draft cancelled".to_string();
            }
            KeyCode::Enter => self.stage_composer_comment(),
            KeyCode::Backspace => {
                if let Some(composer) = self.composer.as_mut() {
                    composer.pop();
                }
            }
            KeyCode::Char(character) => {
                if let Some(composer) = self.composer.as_mut() {
                    composer.push(character);
                }
            }
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
            self.drafts.clear();
            self.composer = None;
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
                self.drafts.clear();
                self.composer = None;
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
                self.drafts.clear();
                self.composer = None;
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
            self.drafts.clear();
            self.composer = None;
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
                self.drafts.clear();
                self.composer = None;
                self.status = format!("Loaded PR #{pr_id}");
            }
            Err(error) => {
                self.detail = None;
                self.comments.clear();
                self.diff = None;
                self.drafts.clear();
                self.composer = None;
                self.error = Some(error);
                self.status = "Failed to load PR detail".to_string();
            }
        }
    }

    fn start_comment_composer(&mut self) {
        if self.selected_pull_request_id().is_none() {
            self.status = "Select a pull request before drafting a comment".to_string();
            return;
        }
        self.composer = Some(String::new());
        self.status = "Composing general review comment".to_string();
    }

    fn stage_composer_comment(&mut self) {
        let Some(raw) = self.composer.take() else {
            return;
        };
        let raw = raw.trim().to_string();
        if raw.is_empty() {
            self.status = "Empty comment discarded".to_string();
            return;
        }
        let id = self.next_draft_id;
        self.next_draft_id += 1;
        self.drafts.push(DraftComment { id, raw });
        self.status = format!("Staged {} draft comment(s)", self.drafts.len());
    }

    fn discard_drafts(&mut self) {
        let count = self.drafts.len();
        self.drafts.clear();
        self.composer = None;
        self.status = format!("Discarded {count} draft comment(s)");
    }

    fn publish_drafts(&mut self) {
        let Some((provider, workspace, repo, pr_id)) = self.selected_review_target() else {
            self.status = "Select a pull request before publishing drafts".to_string();
            return;
        };
        if self.drafts.is_empty() {
            self.status = "No draft comments to publish".to_string();
            return;
        }

        let provider = provider;
        let workspace = workspace;
        let repo = repo;
        self.publish_drafts_with(|raw| {
            create_general_comment_native(
                Some(provider),
                workspace.as_str(),
                repo.as_str(),
                pr_id,
                raw,
                None,
            )
        });
    }

    fn publish_drafts_with(
        &mut self,
        mut publisher: impl FnMut(String) -> Result<PrComment, String>,
    ) {
        let drafts = std::mem::take(&mut self.drafts);
        let mut unpublished = Vec::new();
        let mut published = 0usize;
        for draft in drafts {
            match publisher(draft.raw.clone()) {
                Ok(comment) => {
                    self.comments.push(comment);
                    published += 1;
                }
                Err(error) => {
                    self.error = Some(format!("Publish failed for draft #{}: {error}", draft.id));
                    unpublished.push(draft);
                }
            }
        }

        self.drafts = unpublished;
        if self.drafts.is_empty() {
            self.status = format!("Published {published} draft comment(s)");
            self.error = None;
        } else {
            self.status = format!(
                "Published {published}; {} draft comment(s) still pending",
                self.drafts.len()
            );
        }
    }

    fn selected_pull_request_id(&self) -> Option<u32> {
        self.pull_requests.get(self.selected_pr).map(|pr| pr.id)
    }

    fn selected_review_target(
        &self,
    ) -> Option<(crate::config::ReviewProvider, String, String, u32)> {
        let repo = self.repos.get(self.selected_repo)?;
        let pr_id = self.selected_pull_request_id()?;
        Some((
            repo.provider,
            repo.workspace.clone(),
            repo.repo.clone(),
            pr_id,
        ))
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
            drafts: &self.drafts,
            composer: self.composer.as_deref(),
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

    #[test]
    fn composer_stages_local_draft_without_publishing() {
        let mut app = TuiApp::from_repos(vec![repo("lachesi-hq", "lachesi")]);
        app.pull_requests.push(PullRequestSummary {
            id: 7,
            title: "Draftable".to_string(),
            author_display_name: String::new(),
            author_account_id: None,
            source_branch: "feature".to_string(),
            destination_branch: "main".to_string(),
            state: "OPEN".to_string(),
            draft: false,
            comment_count: 0,
            created_on: String::new(),
            updated_on: String::new(),
            reviewers: Vec::new(),
        });

        app.handle_key(KeyCode::Char('c'));
        app.handle_key(KeyCode::Char('n'));
        app.handle_key(KeyCode::Char('o'));
        app.handle_key(KeyCode::Char('t'));
        app.handle_key(KeyCode::Char('e'));
        app.handle_key(KeyCode::Enter);

        assert_eq!(app.drafts.len(), 1);
        assert_eq!(app.drafts[0].raw, "note");
        assert!(app.comments.is_empty());
    }

    #[test]
    fn discard_drafts_keeps_remote_comments() {
        let mut app = TuiApp::from_repos(Vec::new());
        app.drafts.push(DraftComment {
            id: 1,
            raw: "pending".to_string(),
        });
        app.comments.push(PrComment {
            id: 1,
            parent_id: None,
            content_raw: "remote".to_string(),
            content_html: None,
            user_display_name: "reviewer".to_string(),
            created_on: String::new(),
            deleted: false,
            inline: None,
        });

        app.discard_drafts();

        assert!(app.drafts.is_empty());
        assert_eq!(app.comments.len(), 1);
    }

    #[test]
    fn partial_publish_keeps_failed_drafts_visible() {
        let mut app = TuiApp::from_repos(Vec::new());
        app.drafts.push(DraftComment {
            id: 1,
            raw: "publish".to_string(),
        });
        app.drafts.push(DraftComment {
            id: 2,
            raw: "fail".to_string(),
        });

        app.publish_drafts_with(|raw| {
            if raw == "fail" {
                Err("remote rejected comment".to_string())
            } else {
                Ok(PrComment {
                    id: 10,
                    parent_id: None,
                    content_raw: raw,
                    content_html: None,
                    user_display_name: "reviewer".to_string(),
                    created_on: String::new(),
                    deleted: false,
                    inline: None,
                })
            }
        });

        assert_eq!(app.comments.len(), 1);
        assert_eq!(app.drafts.len(), 1);
        assert_eq!(app.drafts[0].raw, "fail");
        assert!(app
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("draft #2"));
    }
}
