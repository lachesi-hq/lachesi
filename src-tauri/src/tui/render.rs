use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    prelude::{Frame, Line, Modifier, Span, Style},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
};

use crate::config::{RepoRef, ReviewProvider};
use crate::services::bitbucket::{PrComment, PullRequestDetail, PullRequestSummary};
use crate::services::review::{AiReviewRunState, AiReviewRunStatus};

#[derive(Clone, Copy)]
pub struct TuiState<'a> {
    pub repos: &'a [RepoRef],
    pub selected_repo: usize,
    pub focus: FocusPane,
    pub pull_requests: &'a [PullRequestSummary],
    pub selected_pr: usize,
    pub detail: Option<&'a PullRequestDetail>,
    pub comments: &'a [PrComment],
    pub diff: Option<&'a str>,
    pub drafts: &'a [DraftComment],
    pub composer: Option<&'a str>,
    pub ai_review: Option<&'a AiReviewRunState>,
    pub error: Option<&'a str>,
    pub status: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DraftComment {
    pub id: u64,
    pub raw: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusPane {
    Repositories,
    PullRequests,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseTarget {
    Repository(usize),
    PullRequest(usize),
}

pub fn render(frame: &mut Frame<'_>, state: TuiState<'_>) {
    let area = frame.area();
    let [header, body, footer] = *vertical_areas().split(area) else {
        return;
    };

    render_header(frame, header);

    let [repos, review] = *body_areas().split(body) else {
        return;
    };

    render_repos(frame, repos, state);
    render_review(frame, review, state);
    render_footer(frame, footer, state.status);
}

pub fn mouse_target(area: Rect, x: u16, y: u16, state: TuiState<'_>) -> Option<MouseTarget> {
    let [_, body, _] = *vertical_areas().split(area) else {
        return None;
    };
    let [repos, review] = *body_areas().split(body) else {
        return None;
    };
    if let Some(index) = list_index_at(repos, x, y, state.repos.len()) {
        return Some(MouseTarget::Repository(index));
    }

    let [pr_list, _] = *review_areas().split(review) else {
        return None;
    };
    list_index_at(pr_list, x, y, state.pull_requests.len()).map(MouseTarget::PullRequest)
}

fn vertical_areas() -> Layout {
    Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(2),
        ])
}

fn body_areas() -> Layout {
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(36), Constraint::Percentage(64)])
}

fn review_areas() -> Layout {
    Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(34), Constraint::Percentage(66)])
}

fn list_index_at(area: Rect, x: u16, y: u16, len: usize) -> Option<usize> {
    if len == 0 {
        return None;
    }
    let inner_x = area.x.saturating_add(1)..area.x.saturating_add(area.width.saturating_sub(1));
    let inner_y = area.y.saturating_add(1)..area.y.saturating_add(area.height.saturating_sub(1));
    if !inner_x.contains(&x) || !inner_y.contains(&y) {
        return None;
    }
    let index = usize::from(y.saturating_sub(area.y).saturating_sub(1));
    (index < len).then_some(index)
}

fn render_header(frame: &mut Frame<'_>, area: Rect) {
    let header = Paragraph::new(Line::from(vec![
        Span::styled("Lachesi", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(" terminal review workspace"),
    ]))
    .block(Block::default().borders(Borders::BOTTOM));
    frame.render_widget(header, area);
}

fn render_repos(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let items = if state.repos.is_empty() {
        vec![ListItem::new("No repositories configured")]
    } else {
        state
            .repos
            .iter()
            .enumerate()
            .map(|(index, repo)| {
                let marker = if index == state.selected_repo {
                    ">"
                } else {
                    " "
                };
                ListItem::new(format!(
                    "{marker} {} {}/{}",
                    provider_label(repo.provider),
                    repo.workspace,
                    repo.repo
                ))
            })
            .collect()
    };
    let title = if state.focus == FocusPane::Repositories {
        "Repositories *"
    } else {
        "Repositories"
    };
    let list = List::new(items).block(Block::default().title(title).borders(Borders::ALL));
    frame.render_widget(list, area);
}

fn render_review(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let [pr_list, detail] = *review_areas().split(area) else {
        return;
    };
    render_pull_requests(frame, pr_list, state);
    render_detail(frame, detail, state);
}

fn render_pull_requests(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let items = if state.pull_requests.is_empty() {
        vec![ListItem::new("No open pull requests loaded")]
    } else {
        state
            .pull_requests
            .iter()
            .enumerate()
            .map(|(index, pr)| {
                let marker = if index == state.selected_pr { ">" } else { " " };
                ListItem::new(format!(
                    "{marker} #{} {} -> {}  {}",
                    pr.id, pr.source_branch, pr.destination_branch, pr.title
                ))
            })
            .collect()
    };
    let title = if state.focus == FocusPane::PullRequests {
        "Pull requests *"
    } else {
        "Pull requests"
    };
    let list = List::new(items).block(Block::default().title(title).borders(Borders::ALL));
    frame.render_widget(list, area);
}

fn render_detail(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let mut lines = Vec::new();

    if let Some(error) = state.error {
        lines.push(Line::from(vec![
            Span::styled("Error: ", Style::default().add_modifier(Modifier::BOLD)),
            Span::raw(error),
        ]));
        lines.push(Line::from(""));
    }

    match state.detail {
        Some(detail) => {
            lines.push(Line::from(vec![
                Span::styled(
                    format!("#{} ", detail.id),
                    Style::default().add_modifier(Modifier::BOLD),
                ),
                Span::raw(detail.title.as_str()),
            ]));
            lines.push(Line::from(format!(
                "{} -> {} | {} | {} comments",
                detail.source_branch,
                detail.destination_branch,
                detail.state,
                state.comments.len()
            )));
            lines.push(Line::from(format!(
                "Drafts: {} pending",
                state.drafts.len()
            )));
            if let Some(ai_review) = state.ai_review {
                lines.push(Line::from(format!(
                    "AI review: {}{}",
                    ai_review_status_label(ai_review.status),
                    ai_review
                        .error
                        .as_deref()
                        .map(|error| format!(" ({error})"))
                        .unwrap_or_default()
                )));
                if let Some(log) = ai_review.logs.last() {
                    lines.push(Line::from(format!("AI log: {log}")));
                }
            }
            lines.push(Line::from(""));
            lines.push(Line::from(description_preview(
                detail.description_raw.as_str(),
            )));
            lines.push(Line::from(""));
            lines.push(Line::from(diff_preview(state.diff)));
            append_draft_preview(&mut lines, state.drafts);
        }
        None => match state.repos.get(state.selected_repo) {
            Some(repo) => {
                lines.push(Line::from(vec![
                    Span::styled("Provider: ", Style::default().add_modifier(Modifier::BOLD)),
                    Span::raw(provider_label(repo.provider)),
                ]));
                lines.push(Line::from(vec![
                    Span::styled(
                        "Repository: ",
                        Style::default().add_modifier(Modifier::BOLD),
                    ),
                    Span::raw(format!("{}/{}", repo.workspace, repo.repo)),
                ]));
                lines.push(Line::from(vec![
                    Span::styled(
                        "Local path: ",
                        Style::default().add_modifier(Modifier::BOLD),
                    ),
                    Span::raw(repo.local_path.as_deref().unwrap_or("not configured")),
                ]));
            }
            None => {
                lines.push(Line::from(
                    "Configure repositories in Lachesi settings first.",
                ));
                lines.push(Line::from(
                    "This TUI reads the same non-secret settings file as the desktop app.",
                ));
            }
        },
    }

    if let Some(composer) = state.composer {
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled("Draft: ", Style::default().add_modifier(Modifier::BOLD)),
            Span::raw(composer),
        ]));
    }

    let detail = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .block(Block::default().title("Review").borders(Borders::ALL));
    frame.render_widget(detail, area);
}

fn render_footer(frame: &mut Frame<'_>, area: Rect, status: &str) {
    let footer = Paragraph::new(Line::from(vec![
        Span::raw("q quit  "),
        Span::raw("tab focus  "),
        Span::raw("j/k select  "),
        Span::raw("enter load  "),
        Span::raw("c draft  "),
        Span::raw("p publish  "),
        Span::raw("x discard  "),
        Span::raw("a ai review  "),
        Span::raw("g lazygit  "),
        Span::raw("r refresh  "),
        Span::raw(status),
    ]));
    frame.render_widget(footer, area);
}

fn append_draft_preview(lines: &mut Vec<Line<'_>>, drafts: &[DraftComment]) {
    if drafts.is_empty() {
        return;
    }
    lines.push(Line::from(""));
    lines.push(Line::from("Pending drafts:"));
    for draft in drafts.iter().take(3) {
        lines.push(Line::from(format!(
            "- #{} {}",
            draft.id,
            description_preview(draft.raw.as_str())
        )));
    }
}

fn description_preview(description: &str) -> String {
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return "No description.".to_string();
    }
    trimmed.lines().take(4).collect::<Vec<_>>().join(" ")
}

fn diff_preview(diff: Option<&str>) -> String {
    let Some(diff) = diff.map(str::trim).filter(|diff| !diff.is_empty()) else {
        return "Diff not loaded.".to_string();
    };
    let files = diff
        .lines()
        .filter(|line| line.starts_with("diff --git "))
        .count();
    let additions = diff
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let deletions = diff
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    format!("Diff: {files} files, +{additions}/-{deletions}")
}

fn provider_label(provider: ReviewProvider) -> &'static str {
    match provider {
        ReviewProvider::Bitbucket => "bitbucket",
        ReviewProvider::Github => "github",
    }
}

fn ai_review_status_label(status: AiReviewRunStatus) -> &'static str {
    match status {
        AiReviewRunStatus::Idle => "idle",
        AiReviewRunStatus::Running => "running",
        AiReviewRunStatus::Succeeded => "succeeded",
        AiReviewRunStatus::Failed => "failed",
        AiReviewRunStatus::Cancelled => "cancelled",
    }
}

#[cfg(test)]
mod tests {
    use ratatui::{backend::TestBackend, Terminal};

    use super::*;

    fn buffer_text(terminal: &Terminal<TestBackend>) -> String {
        terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>()
    }

    #[test]
    fn renders_empty_repository_state() {
        let backend = TestBackend::new(80, 20);
        let mut terminal = Terminal::new(backend).expect("terminal");

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &[],
                        selected_repo: 0,
                        focus: FocusPane::Repositories,
                        pull_requests: &[],
                        selected_pr: 0,
                        detail: None,
                        comments: &[],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        error: None,
                        status: "Ready",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("No repositories configured"));
        assert!(text.contains("Configure repositories"));
    }

    #[test]
    fn renders_selected_repository_detail() {
        let backend = TestBackend::new(100, 24);
        let mut terminal = Terminal::new(backend).expect("terminal");
        let repos = vec![RepoRef {
            provider: ReviewProvider::Github,
            workspace: "lachesi-hq".to_string(),
            repo: "lachesi".to_string(),
            local_path: Some("/tmp/lachesi".to_string()),
        }];
        let pull_requests = vec![PullRequestSummary {
            id: 12,
            title: "Add terminal UI".to_string(),
            author_display_name: "fdg".to_string(),
            author_account_id: None,
            source_branch: "feature/tui".to_string(),
            destination_branch: "main".to_string(),
            state: "OPEN".to_string(),
            draft: false,
            comment_count: 2,
            created_on: String::new(),
            updated_on: String::new(),
            reviewers: Vec::new(),
        }];

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &repos,
                        selected_repo: 0,
                        focus: FocusPane::PullRequests,
                        pull_requests: &pull_requests,
                        selected_pr: 0,
                        detail: None,
                        comments: &[],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        error: None,
                        status: "Ready",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("github lachesi-hq/lachesi"));
        assert!(text.contains("/tmp/lachesi"));
        assert!(text.contains("#12 feature/tui -> main"));
    }

    #[test]
    fn renders_loaded_pull_request_detail_and_diff_summary() {
        let backend = TestBackend::new(100, 24);
        let mut terminal = Terminal::new(backend).expect("terminal");
        let detail = PullRequestDetail {
            id: 12,
            title: "Add terminal UI".to_string(),
            description_raw: "Review in the terminal.".to_string(),
            state: "OPEN".to_string(),
            draft: false,
            author_display_name: "fdg".to_string(),
            reviewers: Vec::new(),
            source_branch: "feature/tui".to_string(),
            destination_branch: "main".to_string(),
            source_commit_hash: None,
            destination_commit_hash: None,
            created_on: String::new(),
            updated_on: String::new(),
        };
        let comments = vec![PrComment {
            id: 1,
            parent_id: None,
            content_raw: "Looks good".to_string(),
            content_html: None,
            user_display_name: "reviewer".to_string(),
            created_on: String::new(),
            deleted: false,
            inline: None,
        }];

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &[],
                        selected_repo: 0,
                        focus: FocusPane::PullRequests,
                        pull_requests: &[],
                        selected_pr: 0,
                        detail: Some(&detail),
                        comments: &comments,
                        diff: Some("diff --git a/a b/a\n+new\n-old\n"),
                        drafts: &[DraftComment {
                            id: 1,
                            raw: "Please check this.".to_string(),
                        }],
                        composer: None,
                        ai_review: None,
                        error: None,
                        status: "Loaded",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("#12 Add terminal UI"));
        assert!(text.contains("1 comments"));
        assert!(text.contains("Drafts: 1 pending"));
        assert!(text.contains("Diff: 1 files, +1/-1"));
    }

    #[test]
    fn renders_active_composer_text() {
        let backend = TestBackend::new(100, 24);
        let mut terminal = Terminal::new(backend).expect("terminal");

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &[],
                        selected_repo: 0,
                        focus: FocusPane::PullRequests,
                        pull_requests: &[],
                        selected_pr: 0,
                        detail: None,
                        comments: &[],
                        diff: None,
                        drafts: &[],
                        composer: Some("pending thought"),
                        ai_review: None,
                        error: None,
                        status: "Composing",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("Draft: pending thought"));
    }

    #[test]
    fn maps_mouse_clicks_to_repository_and_pull_request_rows() {
        let repos = vec![
            RepoRef {
                provider: ReviewProvider::Github,
                workspace: "lachesi-hq".to_string(),
                repo: "lachesi".to_string(),
                local_path: None,
            },
            RepoRef {
                provider: ReviewProvider::Bitbucket,
                workspace: "team".to_string(),
                repo: "api".to_string(),
                local_path: None,
            },
        ];
        let pull_requests = vec![
            PullRequestSummary {
                id: 12,
                title: "One".to_string(),
                author_display_name: String::new(),
                author_account_id: None,
                source_branch: "one".to_string(),
                destination_branch: "main".to_string(),
                state: "OPEN".to_string(),
                draft: false,
                comment_count: 0,
                created_on: String::new(),
                updated_on: String::new(),
                reviewers: Vec::new(),
            },
            PullRequestSummary {
                id: 13,
                title: "Two".to_string(),
                author_display_name: String::new(),
                author_account_id: None,
                source_branch: "two".to_string(),
                destination_branch: "main".to_string(),
                state: "OPEN".to_string(),
                draft: false,
                comment_count: 0,
                created_on: String::new(),
                updated_on: String::new(),
                reviewers: Vec::new(),
            },
        ];
        let state = TuiState {
            repos: &repos,
            selected_repo: 0,
            focus: FocusPane::Repositories,
            pull_requests: &pull_requests,
            selected_pr: 0,
            detail: None,
            comments: &[],
            diff: None,
            drafts: &[],
            composer: None,
            ai_review: None,
            error: None,
            status: "Ready",
        };

        assert_eq!(
            mouse_target(Rect::new(0, 0, 100, 24), 2, 5, state),
            Some(MouseTarget::Repository(1))
        );
        assert_eq!(
            mouse_target(Rect::new(0, 0, 100, 24), 38, 5, state),
            Some(MouseTarget::PullRequest(1))
        );
    }
}
