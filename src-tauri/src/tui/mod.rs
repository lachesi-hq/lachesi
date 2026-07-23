mod lazygit;
mod render;
mod terminal;

use std::time::Duration;

use crossterm::event::{self, Event, KeyCode, MouseButton, MouseEvent, MouseEventKind};

use crate::config::{self, AiProvider, AppConfig, RepoRef};
use crate::services::bitbucket::{
    create_general_comment_native, get_pr_diff_native, get_pull_request_native,
    list_comments_native, list_pull_requests_native, validate_repo_review_config_native,
    ListPrOptions, PrComment, PullRequestDetail, PullRequestSummary,
};
use crate::services::review::{
    get_ai_review_run_state_native, start_inline_review_native, AiReviewRunState,
    AiReviewRunStatus, AiReviewRunStore,
};
use render::{mouse_target, render, DraftComment, FocusPane, MouseTarget, TuiState};
use terminal::TerminalGuard;

const TICK_RATE: Duration = Duration::from_millis(250);
const DEFAULT_REVIEW_PROMPT: &str = include_str!("../../../src/lib/defaultReviewPrompt.md");

pub fn run_from_env() -> Result<(), String> {
    let config = config::load();
    let mut app = TuiApp::from_config(config);
    app.load_selected_repo();
    let mut terminal = TerminalGuard::enter().map_err(|error| error.to_string())?;

    loop {
        app.refresh_ai_review_state();
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
                Event::Mouse(mouse) => {
                    let area = terminal.area().map_err(|error| error.to_string())?;
                    app.handle_mouse(mouse, area);
                }
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
    ai_provider: AiProvider,
    claude_model: Option<String>,
    claude_effort: Option<String>,
    codex_model: Option<String>,
    codex_effort: Option<String>,
    ai_review_store: AiReviewRunStore,
    active_ai_target: Option<(String, String, u32)>,
    ai_review_state: Option<AiReviewRunState>,
    error: Option<String>,
    status: String,
    should_quit: bool,
}

impl TuiApp {
    fn from_config(config: AppConfig) -> Self {
        Self {
            ai_provider: config.ai_provider,
            claude_model: config.claude_model,
            claude_effort: config.claude_effort,
            codex_model: config.codex_model,
            codex_effort: config.codex_effort,
            ..Self::from_repos(config.repos)
        }
    }

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
            ai_provider: AiProvider::default(),
            claude_model: None,
            claude_effort: None,
            codex_model: None,
            codex_effort: None,
            ai_review_store: AiReviewRunStore::default(),
            active_ai_target: None,
            ai_review_state: None,
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
            KeyCode::Char('a') => self.start_ai_review(),
            KeyCode::Char('r') => self.load_selected_repo(),
            KeyCode::Down | KeyCode::Char('j') => self.select_next(),
            KeyCode::Up | KeyCode::Char('k') => self.select_previous(),
            _ => {}
        }
    }

    fn handle_mouse(&mut self, mouse: MouseEvent, area: ratatui::layout::Rect) {
        if self.composer.is_some() {
            return;
        }
        if mouse.kind != MouseEventKind::Down(MouseButton::Left) {
            return;
        }
        match mouse_target(area, mouse.column, mouse.row, self.view_state()) {
            Some(MouseTarget::Repository(index)) => self.select_repo(index),
            Some(MouseTarget::PullRequest(index)) => self.select_pr(index),
            None => {}
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

    fn select_repo(&mut self, index: usize) {
        if index >= self.repos.len() {
            return;
        }
        self.focus = FocusPane::Repositories;
        if self.selected_repo != index {
            self.selected_repo = index;
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

    fn select_pr(&mut self, index: usize) {
        if index >= self.pull_requests.len() {
            return;
        }
        self.focus = FocusPane::PullRequests;
        self.selected_pr = index;
        self.load_selected_pr();
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
                self.active_ai_target = None;
                self.ai_review_state = None;
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
                self.active_ai_target = None;
                self.ai_review_state = None;
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
                self.active_ai_target = Some((workspace.clone(), repo_name.clone(), pr_id));
                self.refresh_ai_review_state();
                self.status = format!("Loaded PR #{pr_id}");
            }
            Err(error) => {
                self.detail = None;
                self.comments.clear();
                self.diff = None;
                self.drafts.clear();
                self.composer = None;
                self.active_ai_target = None;
                self.ai_review_state = None;
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

    fn start_ai_review(&mut self) {
        let Some((provider, workspace, repo, pr_id)) = self.selected_review_target() else {
            self.status = "Select a pull request before starting AI review".to_string();
            return;
        };
        let Some(detail) = self.detail.as_ref() else {
            self.status = "Load pull request detail before starting AI review".to_string();
            return;
        };
        let title = detail.title.clone();
        let source_branch = detail.source_branch.clone();
        let destination_branch = detail.destination_branch.clone();
        let diff = match self
            .diff
            .as_deref()
            .map(str::trim)
            .filter(|diff| !diff.is_empty())
        {
            Some(diff) => diff.to_string(),
            None => match get_pr_diff_native(Some(provider), &workspace, &repo, pr_id) {
                Ok(diff) => {
                    self.diff = Some(diff.clone());
                    diff
                }
                Err(error) => {
                    self.error = Some(error);
                    self.status = "Failed to load diff for AI review".to_string();
                    return;
                }
            },
        };
        let prompt = match self.review_prompt_for_selected_repo() {
            Ok(prompt) => prompt,
            Err(error) => {
                self.error = Some(error);
                self.status = "Failed to load review prompt".to_string();
                return;
            }
        };
        let payload = build_review_payload(&prompt, detail, &diff);
        match start_inline_review_native(
            self.ai_review_store.clone(),
            workspace.clone(),
            repo.clone(),
            pr_id,
            title,
            source_branch,
            destination_branch,
            payload,
            Some("Review this pull request from the terminal UI.".to_string()),
            None,
            Some("Review".to_string()),
            false,
            self.ai_provider,
            self.claude_model.clone(),
            self.claude_effort.clone(),
            self.codex_model.clone(),
            self.codex_effort.clone(),
            None,
        ) {
            Ok(state) => {
                self.active_ai_target = Some((workspace, repo, pr_id));
                self.ai_review_state = Some(state);
                self.error = None;
                self.status = format!("Started {} AI review", ai_provider_label(self.ai_provider));
            }
            Err(error) => {
                self.error = Some(error);
                self.status = "Failed to start AI review".to_string();
            }
        }
    }

    fn review_prompt_for_selected_repo(&self) -> Result<String, String> {
        let Some(repo) = self.repos.get(self.selected_repo) else {
            return Ok(default_review_prompt());
        };
        let Some(local_path) = repo
            .local_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
        else {
            return Ok(default_review_prompt());
        };
        let result = validate_repo_review_config_native(std::path::Path::new(local_path), None)?;
        if !result.errors.is_empty() {
            return Err(result
                .errors
                .into_iter()
                .map(|error| error.message)
                .collect::<Vec<_>>()
                .join("\n"));
        }
        let extension = result
            .config
            .and_then(|config| config.review)
            .and_then(|review| review.prompt)
            .and_then(|prompt| prompt.extend)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        Ok(match extension {
            Some(extension) => {
                format!(
                    "{}\n\n## Repository review policy\n{extension}",
                    default_review_prompt()
                )
            }
            None => default_review_prompt(),
        })
    }

    fn refresh_ai_review_state(&mut self) {
        let Some((workspace, repo, pr_id)) = self.active_ai_target.as_ref() else {
            return;
        };
        self.ai_review_state =
            get_ai_review_run_state_native(&self.ai_review_store, workspace, repo, *pr_id);
        if let Some(state) = self.ai_review_state.as_ref() {
            self.status = match state.status {
                AiReviewRunStatus::Running => {
                    format!(
                        "AI review running: {}",
                        state.logs.last().map(String::as_str).unwrap_or("started")
                    )
                }
                AiReviewRunStatus::Succeeded => "AI review completed".to_string(),
                AiReviewRunStatus::Failed => "AI review failed".to_string(),
                AiReviewRunStatus::Cancelled => "AI review cancelled".to_string(),
                AiReviewRunStatus::Idle => self.status.clone(),
            };
        }
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
            ai_review: self.ai_review_state.as_ref(),
            error: self.error.as_deref(),
            status: self.status.as_str(),
        }
    }
}

fn build_review_payload(prompt: &str, detail: &PullRequestDetail, diff: &str) -> String {
    let mut lines = vec![
        prompt.trim().to_string(),
        String::new(),
        "## Pull request".to_string(),
        format!("{} (#{})", detail.title, detail.id),
        format!(
            "Branch: {} -> {}",
            detail.source_branch, detail.destination_branch
        ),
    ];
    if !detail.description_raw.trim().is_empty() {
        lines.extend([
            String::new(),
            "## Description".to_string(),
            detail.description_raw.trim().to_string(),
        ]);
    }
    lines.extend([
        String::new(),
        "## Diff".to_string(),
        "```diff".to_string(),
        diff.trim().to_string(),
        "```".to_string(),
    ]);
    lines.join("\n")
}

fn ai_provider_label(provider: AiProvider) -> &'static str {
    match provider {
        AiProvider::Claude => "Claude",
        AiProvider::Codex => "Codex",
    }
}

fn default_review_prompt() -> String {
    DEFAULT_REVIEW_PROMPT.trim().to_string()
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

    fn pr(id: u32, title: &str) -> PullRequestSummary {
        PullRequestSummary {
            id,
            title: title.to_string(),
            author_display_name: String::new(),
            author_account_id: None,
            source_branch: format!("feature/{id}"),
            destination_branch: "main".to_string(),
            state: "OPEN".to_string(),
            draft: false,
            comment_count: 0,
            created_on: String::new(),
            updated_on: String::new(),
            reviewers: Vec::new(),
        }
    }

    fn detail(id: u32, title: &str) -> PullRequestDetail {
        PullRequestDetail {
            id,
            title: title.to_string(),
            description_raw: "Review this.".to_string(),
            state: "OPEN".to_string(),
            draft: false,
            author_display_name: String::new(),
            reviewers: Vec::new(),
            source_branch: format!("feature/{id}"),
            destination_branch: "main".to_string(),
            source_commit_hash: None,
            destination_commit_hash: None,
            created_on: String::new(),
            updated_on: String::new(),
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
    fn mouse_selects_pull_request_rows() {
        let mut app = TuiApp::from_repos(vec![repo("lachesi-hq", "lachesi")]);
        app.pull_requests = vec![pr(1, "One"), pr(2, "Two")];

        app.handle_mouse(
            MouseEvent {
                kind: MouseEventKind::Down(MouseButton::Left),
                column: 38,
                row: 5,
                modifiers: event::KeyModifiers::empty(),
            },
            ratatui::layout::Rect::new(0, 0, 100, 24),
        );

        assert_eq!(app.focus, FocusPane::PullRequests);
        assert_eq!(app.selected_pr, 1);
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

    #[test]
    fn review_payload_includes_pr_context_and_diff() {
        let detail = detail(7, "Add GitHub TUI support");

        let payload =
            build_review_payload("Review carefully.", &detail, "diff --git a/a b/a\n+new");

        assert!(payload.contains("Review carefully."));
        assert!(payload.contains("Add GitHub TUI support (#7)"));
        assert!(payload.contains("Branch: feature/7 -> main"));
        assert!(payload.contains("```diff\ndiff --git a/a b/a\n+new\n```"));
    }
}
