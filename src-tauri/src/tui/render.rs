use std::cmp;

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    prelude::{Color, Frame, Line, Modifier, Span, Style},
    widgets::{
        Block, Borders, List, ListItem, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState,
    },
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
    pub ai_reviewed_pr_ids: &'a [u32],
    pub ai_review_running_pr_ids: &'a [u32],
    pub diff: Option<&'a str>,
    pub drafts: &'a [DraftComment],
    pub composer: Option<&'a str>,
    pub ai_review: Option<&'a AiReviewRunState>,
    pub ai_review_output: Option<&'a str>,
    pub detail_view: DetailView,
    pub detail_scroll: usize,
    pub ai_review_scroll: usize,
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
pub enum DetailView {
    PullRequest,
    AiReview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseTarget {
    Repository(usize),
    PullRequest(usize),
}

const SURFACE: Color = Color::Rgb(13, 17, 23);
const PANEL: Color = Color::Rgb(18, 24, 32);
const BORDER: Color = Color::Rgb(82, 96, 112);
const TEXT: Color = Color::Rgb(222, 228, 236);
const MUTED: Color = Color::Rgb(136, 148, 164);
const ACCENT: Color = Color::Rgb(255, 176, 64);
const INFO: Color = Color::Rgb(94, 188, 255);
const SUCCESS: Color = Color::Rgb(74, 222, 128);
const ERROR: Color = Color::LightRed;

pub fn render(frame: &mut Frame<'_>, state: TuiState<'_>) {
    let area = frame.area();
    frame.render_widget(Block::default().style(base_style()), area);
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

pub fn detail_view_target(area: Rect, x: u16, y: u16) -> Option<DetailView> {
    let [_, body, _] = *vertical_areas().split(area) else {
        return None;
    };
    let [_, review] = *body_areas().split(body) else {
        return None;
    };
    let [_, details] = *review_areas().split(review) else {
        return None;
    };
    let [pull_request, ai_review] = *detail_areas().split(details) else {
        return None;
    };
    if rect_contains(pull_request, x, y) {
        Some(DetailView::PullRequest)
    } else if rect_contains(ai_review, x, y) {
        Some(DetailView::AiReview)
    } else {
        None
    }
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
        .constraints([Constraint::Percentage(28), Constraint::Percentage(72)])
}

fn review_areas() -> Layout {
    Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(34), Constraint::Percentage(66)])
}

fn detail_areas() -> Layout {
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(45), Constraint::Percentage(55)])
}

fn rect_contains(area: Rect, x: u16, y: u16) -> bool {
    x >= area.x
        && x < area.x.saturating_add(area.width)
        && y >= area.y
        && y < area.y.saturating_add(area.height)
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
        Span::styled("Lachesi", accent_style().add_modifier(Modifier::BOLD)),
        Span::styled(" terminal review workspace", text_style()),
    ]))
    .style(base_style())
    .block(
        Block::default()
            .borders(Borders::BOTTOM)
            .border_style(border_style()),
    );
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
                let selected = index == state.selected_repo;
                let marker = if selected { ">" } else { " " };
                ListItem::new(Line::from(vec![
                    Span::styled(
                        marker,
                        if selected {
                            accent_style()
                        } else {
                            muted_style()
                        },
                    ),
                    Span::raw(" "),
                    Span::styled(provider_label(repo.provider), provider_style(repo.provider)),
                    Span::styled(
                        format!(" {}/{}", repo.workspace, repo.repo),
                        if selected {
                            text_style().add_modifier(Modifier::BOLD)
                        } else {
                            text_style()
                        },
                    ),
                ]))
            })
            .collect()
    };
    let title = if state.focus == FocusPane::Repositories {
        "Repositories *"
    } else {
        "Repositories"
    };
    let list = List::new(items)
        .style(panel_style())
        .block(panel_block(title, state.focus == FocusPane::Repositories));
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
                let selected = index == state.selected_pr;
                let reviewed = state.ai_reviewed_pr_ids.contains(&pr.id);
                let running = state.ai_review_running_pr_ids.contains(&pr.id);
                let marker = if selected { ">" } else { " " };
                ListItem::new(Line::from(vec![
                    Span::styled(
                        marker,
                        if selected {
                            accent_style()
                        } else {
                            muted_style()
                        },
                    ),
                    Span::raw(" "),
                    pr_review_marker(running, reviewed),
                    Span::styled(format!("#{} ", pr.id), info_style()),
                    Span::styled(pr.source_branch.clone(), branch_style()),
                    Span::styled(" -> ", muted_style()),
                    Span::styled(pr.destination_branch.clone(), branch_style()),
                    Span::styled("  ", text_style()),
                    Span::styled(
                        pr.title.clone(),
                        if selected {
                            text_style().add_modifier(Modifier::BOLD)
                        } else {
                            text_style()
                        },
                    ),
                ]))
            })
            .collect()
    };
    let title = if state.focus == FocusPane::PullRequests {
        "Pull requests *"
    } else {
        "Pull requests"
    };
    let list = List::new(items)
        .style(panel_style())
        .block(panel_block(title, state.focus == FocusPane::PullRequests));
    frame.render_widget(list, area);
}

fn render_detail(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let [pull_request, ai_review] = *detail_areas().split(area) else {
        return;
    };
    render_pull_request_detail(frame, pull_request, state);
    render_ai_review_detail(frame, ai_review, state);
}

fn render_pull_request_detail(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let mut lines = Vec::new();

    if let Some(error) = state.error {
        lines.push(Line::from(vec![
            Span::styled("Error: ", error_style().add_modifier(Modifier::BOLD)),
            Span::styled(error, error_style()),
        ]));
        lines.push(Line::from(""));
    }

    match state.detail {
        Some(detail) => {
            lines.push(Line::from(vec![
                Span::styled(
                    format!("#{} ", detail.id),
                    info_style().add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    detail.title.as_str(),
                    text_style().add_modifier(Modifier::BOLD),
                ),
            ]));
            lines.push(Line::from(vec![
                Span::styled(detail.source_branch.as_str(), branch_style()),
                Span::styled(" -> ", muted_style()),
                Span::styled(detail.destination_branch.as_str(), branch_style()),
                Span::styled(" | ", muted_style()),
                Span::styled(detail.state.as_str(), status_style(detail.state.as_str())),
                Span::styled(" | ", muted_style()),
                Span::styled(format!("{} comments", state.comments.len()), text_style()),
            ]));
            lines.push(Line::from(vec![
                Span::styled("Drafts: ", muted_style()),
                Span::styled(format!("{} pending", state.drafts.len()), text_style()),
            ]));
            lines.push(Line::from(""));
            append_description_lines(
                &mut lines,
                detail.description_raw.as_str(),
                content_width(area),
            );
            lines.push(Line::from(""));
            lines.push(Line::from(diff_preview(state.diff)));
            append_draft_preview(&mut lines, state.drafts);
        }
        None => match state.repos.get(state.selected_repo) {
            Some(repo) => {
                lines.push(Line::from(vec![
                    Span::styled("Provider: ", accent_style().add_modifier(Modifier::BOLD)),
                    Span::styled(provider_label(repo.provider), provider_style(repo.provider)),
                ]));
                lines.push(Line::from(vec![
                    Span::styled("Repository: ", accent_style().add_modifier(Modifier::BOLD)),
                    Span::styled(format!("{}/{}", repo.workspace, repo.repo), text_style()),
                ]));
                lines.push(Line::from(vec![
                    Span::styled("Local path: ", accent_style().add_modifier(Modifier::BOLD)),
                    Span::styled(
                        repo.local_path.as_deref().unwrap_or("not configured"),
                        text_style(),
                    ),
                ]));
            }
            None => {
                lines.push(Line::from("Configure repos in Lachesi settings."));
                lines.push(Line::from("TUI uses the desktop app settings file."));
            }
        },
    }

    if let Some(composer) = state.composer {
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled("Draft: ", accent_style().add_modifier(Modifier::BOLD)),
            Span::styled(composer, text_style()),
        ]));
    }

    let content_len = lines.len();
    let scroll = clamped_scroll(content_len, area.height, state.detail_scroll);
    let title = if state.detail_view == DetailView::PullRequest {
        "Pull request *"
    } else {
        "Pull request"
    };
    let detail = Paragraph::new(lines)
        .scroll((scroll as u16, 0))
        .style(panel_style())
        .block(panel_block(
            title,
            state.detail_view == DetailView::PullRequest,
        ));
    frame.render_widget(detail, area);
    render_scrollbar(frame, area, content_len, scroll);
}

fn render_ai_review_detail(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let mut lines = Vec::new();
    if let Some(ai_review) = state.ai_review {
        lines.push(Line::from(vec![
            Span::styled("Status: ", muted_style()),
            Span::styled(
                ai_review_status_label(ai_review.status),
                ai_review_status_style(ai_review.status),
            ),
            Span::styled(
                ai_review
                    .error
                    .as_deref()
                    .map(|error| format!(" ({error})"))
                    .unwrap_or_default(),
                error_style(),
            ),
        ]));
        if let Some(log) = ai_review.logs.last() {
            lines.push(Line::from(vec![
                Span::styled("Log: ", muted_style()),
                Span::styled(log.clone(), text_style()),
            ]));
        }
        lines.push(Line::from(""));
    } else {
        lines.push(Line::from("No AI review run for this pull request."));
        lines.push(Line::from(""));
    }
    append_ai_review_output(&mut lines, state.ai_review_output, content_width(area));

    let content_len = lines.len();
    let scroll = clamped_scroll(content_len, area.height, state.ai_review_scroll);
    let title = if state.detail_view == DetailView::AiReview {
        "AI review *"
    } else {
        "AI review"
    };
    let detail = Paragraph::new(lines)
        .scroll((scroll as u16, 0))
        .style(panel_style())
        .block(panel_block(
            title,
            state.detail_view == DetailView::AiReview,
        ));
    frame.render_widget(detail, area);
    render_scrollbar(frame, area, content_len, scroll);
}

fn render_footer(frame: &mut Frame<'_>, area: Rect, status: &str) {
    let footer = Paragraph::new(Line::from(vec![
        Span::styled("q", accent_style()),
        Span::styled(" quit  ", muted_style()),
        Span::styled("tab", accent_style()),
        Span::styled(" focus  ", muted_style()),
        Span::styled("j/k", accent_style()),
        Span::styled(" select  ", muted_style()),
        Span::styled("enter", accent_style()),
        Span::styled(" load  ", muted_style()),
        Span::styled("c", accent_style()),
        Span::styled(" draft  ", muted_style()),
        Span::styled("p", accent_style()),
        Span::styled(" publish  ", muted_style()),
        Span::styled("x", accent_style()),
        Span::styled(" discard  ", muted_style()),
        Span::styled("a", accent_style()),
        Span::styled(" ai review  ", muted_style()),
        Span::styled("v", accent_style()),
        Span::styled(" pane  ", muted_style()),
        Span::styled("y", accent_style()),
        Span::styled(" copy review  ", muted_style()),
        Span::styled("PgUp/PgDn", accent_style()),
        Span::styled(" scroll  ", muted_style()),
        Span::styled("g", accent_style()),
        Span::styled(" lazygit  ", muted_style()),
        Span::styled("r", accent_style()),
        Span::styled(" refresh  ", muted_style()),
        Span::styled(status, info_style()),
    ]))
    .style(base_style());
    frame.render_widget(footer, area);
}

fn append_draft_preview(lines: &mut Vec<Line<'_>>, drafts: &[DraftComment]) {
    if drafts.is_empty() {
        return;
    }
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled("Pending drafts:", accent_style())));
    for draft in drafts.iter().take(3) {
        lines.push(Line::from(vec![
            Span::styled(format!("- #{} ", draft.id), info_style()),
            Span::styled(description_preview(draft.raw.as_str()), text_style()),
        ]));
    }
}

fn pr_review_marker(running: bool, reviewed: bool) -> Span<'static> {
    if running {
        return Span::styled("[RUN] ", accent_style().add_modifier(Modifier::BOLD));
    }
    if reviewed {
        return Span::styled("[AI] ", success_style().add_modifier(Modifier::BOLD));
    }
    Span::styled("[--] ", muted_style())
}

fn append_ai_review_output(lines: &mut Vec<Line<'_>>, output: Option<&str>, width: usize) {
    let Some(output) = output.map(str::trim).filter(|output| !output.is_empty()) else {
        lines.push(Line::from(Span::styled(
            "No saved AI review output yet.",
            muted_style(),
        )));
        return;
    };
    lines.push(Line::from(Span::styled("Output:", accent_style())));
    for line in output.lines() {
        for wrapped in wrap_plain_line(line, width) {
            lines.push(Line::from(style_review_line(wrapped.as_str())));
        }
    }
}

fn append_description_lines<'a>(lines: &mut Vec<Line<'a>>, description: &str, width: usize) {
    let trimmed = description.trim();
    if trimmed.is_empty() {
        lines.push(Line::from(Span::styled("No description.", muted_style())));
        return;
    }
    lines.push(Line::from(Span::styled("Description:", accent_style())));
    for line in trimmed.lines() {
        for wrapped in wrap_plain_line(line, width) {
            lines.push(Line::from(wrapped));
        }
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

fn render_scrollbar(frame: &mut Frame<'_>, area: Rect, content_len: usize, offset: usize) {
    let inner_height = usize::from(area.height.saturating_sub(2));
    if content_len <= inner_height.max(1) {
        return;
    }
    let mut scrollbar_state = ScrollbarState::new(content_len).position(offset);
    frame.render_stateful_widget(
        Scrollbar::default()
            .orientation(ScrollbarOrientation::VerticalRight)
            .style(Style::default().fg(ACCENT).bg(PANEL)),
        area,
        &mut scrollbar_state,
    );
}

fn content_width(area: Rect) -> usize {
    usize::from(area.width.saturating_sub(3)).max(8)
}

fn clamped_scroll(content_len: usize, area_height: u16, offset: usize) -> usize {
    let visible_rows = usize::from(area_height.saturating_sub(2)).max(1);
    let max_offset = content_len.saturating_sub(visible_rows);
    offset.min(max_offset).min(usize::from(u16::MAX))
}

fn wrap_plain_line(line: &str, width: usize) -> Vec<String> {
    let width = width.max(8);
    if line.is_empty() {
        return vec![String::new()];
    }

    let mut rows = Vec::new();
    let mut remaining = line.trim_end().to_string();
    while remaining.chars().count() > width {
        let split_at = preferred_wrap_index(remaining.as_str(), width);
        let (head, tail) = split_at_char(remaining.as_str(), split_at);
        rows.push(head.trim_end().to_string());
        remaining = tail.trim_start().to_string();
        if remaining.is_empty() {
            break;
        }
    }
    rows.push(remaining);
    rows
}

fn preferred_wrap_index(line: &str, width: usize) -> usize {
    let mut last_break = None;
    for (index, character) in line.chars().enumerate() {
        if index >= width {
            break;
        }
        if character.is_whitespace() || matches!(character, '/' | '-' | ',' | '.') {
            last_break = Some(index + 1);
        }
    }
    last_break.unwrap_or(width)
}

fn split_at_char(line: &str, char_index: usize) -> (&str, &str) {
    if char_index == 0 {
        return ("", line);
    }
    let byte_index = line
        .char_indices()
        .nth(char_index)
        .map(|(index, _)| index)
        .unwrap_or_else(|| line.len());
    line.split_at(cmp::min(byte_index, line.len()))
}

fn style_review_line(line: &str) -> Vec<Span<'static>> {
    if line.starts_with("**[Critical]**") || line.starts_with("**[CRITICAL]**") {
        return vec![Span::styled(
            line.to_string(),
            error_style().add_modifier(Modifier::BOLD),
        )];
    }
    if line.starts_with("**[Major]**") || line.starts_with("**[MAJOR]**") {
        return vec![Span::styled(
            line.to_string(),
            accent_style().add_modifier(Modifier::BOLD),
        )];
    }
    if line.starts_with("**[Minor]**") || line.starts_with("**[MINOR]**") {
        return vec![Span::styled(
            line.to_string(),
            info_style().add_modifier(Modifier::BOLD),
        )];
    }
    if line.starts_with("**[Nit]**") || line.starts_with("**[NIT]**") {
        return vec![Span::styled(line.to_string(), muted_style())];
    }
    if line.starts_with("Fix:") {
        return vec![
            Span::styled("Fix:", success_style().add_modifier(Modifier::BOLD)),
            Span::styled(line.trim_start_matches("Fix:").to_string(), text_style()),
        ];
    }
    if line.starts_with('#') {
        return vec![Span::styled(
            line.to_string(),
            info_style().add_modifier(Modifier::BOLD),
        )];
    }
    vec![Span::styled(line.to_string(), text_style())]
}

fn panel_block(title: &'static str, active: bool) -> Block<'static> {
    let title_style = if active {
        accent_style().add_modifier(Modifier::BOLD)
    } else {
        muted_style()
    };
    Block::default()
        .title(Line::from(Span::styled(title, title_style)))
        .borders(Borders::ALL)
        .border_style(if active {
            accent_style()
        } else {
            border_style()
        })
        .style(panel_style())
}

fn base_style() -> Style {
    Style::default().fg(TEXT).bg(SURFACE)
}

fn panel_style() -> Style {
    Style::default().fg(TEXT).bg(PANEL)
}

fn border_style() -> Style {
    Style::default().fg(BORDER).bg(SURFACE)
}

fn accent_style() -> Style {
    Style::default().fg(ACCENT).bg(SURFACE)
}

fn muted_style() -> Style {
    Style::default().fg(MUTED).bg(SURFACE)
}

fn text_style() -> Style {
    Style::default().fg(TEXT).bg(SURFACE)
}

fn info_style() -> Style {
    Style::default().fg(INFO).bg(SURFACE)
}

fn success_style() -> Style {
    Style::default().fg(SUCCESS).bg(SURFACE)
}

fn error_style() -> Style {
    Style::default().fg(ERROR).bg(SURFACE)
}

fn branch_style() -> Style {
    Style::default().fg(INFO).bg(SURFACE)
}

fn provider_style(provider: ReviewProvider) -> Style {
    match provider {
        ReviewProvider::Bitbucket => accent_style(),
        ReviewProvider::Github => success_style(),
    }
}

fn status_style(status: &str) -> Style {
    match status {
        "OPEN" => success_style(),
        "MERGED" => info_style(),
        "DECLINED" | "SUPERSEDED" => error_style(),
        _ => text_style(),
    }
}

fn ai_review_status_style(status: AiReviewRunStatus) -> Style {
    match status {
        AiReviewRunStatus::Succeeded => success_style(),
        AiReviewRunStatus::Failed | AiReviewRunStatus::Cancelled => error_style(),
        AiReviewRunStatus::Running => accent_style(),
        AiReviewRunStatus::Idle => muted_style(),
    }
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
        let backend = TestBackend::new(120, 20);
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
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: None,
                        detail_view: DetailView::PullRequest,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
                        error: None,
                        status: "Ready",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("No repositories configured"));
        assert!(text.contains("Configure repos"));
    }

    #[test]
    fn renders_selected_repository_detail() {
        let backend = TestBackend::new(140, 24);
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
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: None,
                        detail_view: DetailView::PullRequest,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
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
    fn renders_ai_review_markers_in_pull_request_list() {
        let backend = TestBackend::new(120, 24);
        let mut terminal = Terminal::new(backend).expect("terminal");
        let pull_requests = vec![
            PullRequestSummary {
                id: 12,
                title: "Reviewed".to_string(),
                author_display_name: String::new(),
                author_account_id: None,
                source_branch: "feature/reviewed".to_string(),
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
                title: "Pending".to_string(),
                author_display_name: String::new(),
                author_account_id: None,
                source_branch: "feature/pending".to_string(),
                destination_branch: "main".to_string(),
                state: "OPEN".to_string(),
                draft: false,
                comment_count: 0,
                created_on: String::new(),
                updated_on: String::new(),
                reviewers: Vec::new(),
            },
            PullRequestSummary {
                id: 14,
                title: "Running".to_string(),
                author_display_name: String::new(),
                author_account_id: None,
                source_branch: "feature/running".to_string(),
                destination_branch: "main".to_string(),
                state: "OPEN".to_string(),
                draft: false,
                comment_count: 0,
                created_on: String::new(),
                updated_on: String::new(),
                reviewers: Vec::new(),
            },
        ];

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &[],
                        selected_repo: 0,
                        focus: FocusPane::PullRequests,
                        pull_requests: &pull_requests,
                        selected_pr: 0,
                        detail: None,
                        comments: &[],
                        ai_reviewed_pr_ids: &[12],
                        ai_review_running_pr_ids: &[14],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: None,
                        detail_view: DetailView::PullRequest,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
                        error: None,
                        status: "Ready",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("[AI] #12"));
        assert!(text.contains("[--] #13"));
        assert!(text.contains("[RUN] #14"));
    }

    #[test]
    fn renders_loaded_pull_request_detail_and_diff_summary() {
        let backend = TestBackend::new(140, 24);
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
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: Some("diff --git a/a b/a\n+new\n-old\n"),
                        drafts: &[DraftComment {
                            id: 1,
                            raw: "Please check this.".to_string(),
                        }],
                        composer: None,
                        ai_review: None,
                        ai_review_output: None,
                        detail_view: DetailView::PullRequest,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
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
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: None,
                        drafts: &[],
                        composer: Some("pending thought"),
                        ai_review: None,
                        ai_review_output: None,
                        detail_view: DetailView::PullRequest,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
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
            ai_reviewed_pr_ids: &[],
            ai_review_running_pr_ids: &[],
            diff: None,
            drafts: &[],
            composer: None,
            ai_review: None,
            ai_review_output: None,
            detail_view: DetailView::PullRequest,
            detail_scroll: 0,
            ai_review_scroll: 0,
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

    #[test]
    fn renders_ai_review_output_view() {
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
                        comments: &[],
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: Some("diff --git a/a b/a\n+new\n-old\n"),
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: Some("## Summary\nReview result body."),
                        detail_view: DetailView::AiReview,
                        detail_scroll: 0,
                        ai_review_scroll: 0,
                        error: None,
                        status: "Loaded",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("AI review"));
        assert!(text.contains("Review result body"));
        assert!(text.contains("Review in the terminal."));
        assert!(text.contains("Diff: 1 files"));
    }

    #[test]
    fn scrolls_ai_review_output_without_hiding_pull_request_detail() {
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
        let output = (0..32)
            .map(|index| format!("Review output line {index:02}"))
            .collect::<Vec<_>>()
            .join("\n");

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
                        comments: &[],
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: Some("diff --git a/a b/a\n+new\n-old\n"),
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: Some(&output),
                        detail_view: DetailView::AiReview,
                        detail_scroll: 0,
                        ai_review_scroll: 10,
                        error: None,
                        status: "Loaded",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("Review in the terminal."));
        assert!(text.contains("Review output line 10"));
        assert!(!text.contains("Review output line 00"));
    }

    #[test]
    fn scrolls_wrapped_ai_review_output_rows() {
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
        let output = format!("{}tail-marker", "wrapped review phrase ".repeat(80));

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
                        comments: &[],
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: Some("diff --git a/a b/a\n+new\n-old\n"),
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: Some(&output),
                        detail_view: DetailView::AiReview,
                        detail_scroll: 0,
                        ai_review_scroll: usize::MAX,
                        error: None,
                        status: "Loaded",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("Review in the terminal."));
        assert!(text.contains("tail-marker"));
        assert!(!text.contains("Output:"));
    }

    #[test]
    fn clamps_large_ai_review_scroll_offsets() {
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
        let output = (0..20)
            .map(|index| format!("Review output line {index:02}"))
            .collect::<Vec<_>>()
            .join("\n");

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
                        comments: &[],
                        ai_reviewed_pr_ids: &[],
                        ai_review_running_pr_ids: &[],
                        diff: None,
                        drafts: &[],
                        composer: None,
                        ai_review: None,
                        ai_review_output: Some(&output),
                        detail_view: DetailView::AiReview,
                        detail_scroll: usize::MAX,
                        ai_review_scroll: usize::MAX,
                        error: None,
                        status: "Loaded",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("Review output line 18"));
    }
}
