use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    prelude::{Frame, Line, Modifier, Span, Style},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
};

use crate::config::{RepoRef, ReviewProvider};

#[derive(Clone, Copy)]
pub struct TuiState<'a> {
    pub repos: &'a [RepoRef],
    pub selected_repo: usize,
    pub status: &'a str,
}

pub fn render(frame: &mut Frame<'_>, state: TuiState<'_>) {
    let area = frame.area();
    let [header, body, footer] = *Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(2),
        ])
        .split(area)
    else {
        return;
    };

    render_header(frame, header);

    let [repos, detail] = *Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(36), Constraint::Percentage(64)])
        .split(body)
    else {
        return;
    };

    render_repos(frame, repos, state);
    render_detail(frame, detail, state);
    render_footer(frame, footer, state.status);
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
    let list = List::new(items).block(Block::default().title("Repositories").borders(Borders::ALL));
    frame.render_widget(list, area);
}

fn render_detail(frame: &mut Frame<'_>, area: Rect, state: TuiState<'_>) {
    let lines = match state.repos.get(state.selected_repo) {
        Some(repo) => vec![
            Line::from(vec![
                Span::styled("Provider: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(provider_label(repo.provider)),
            ]),
            Line::from(vec![
                Span::styled(
                    "Repository: ",
                    Style::default().add_modifier(Modifier::BOLD),
                ),
                Span::raw(format!("{}/{}", repo.workspace, repo.repo)),
            ]),
            Line::from(vec![
                Span::styled(
                    "Local path: ",
                    Style::default().add_modifier(Modifier::BOLD),
                ),
                Span::raw(repo.local_path.as_deref().unwrap_or("not configured")),
            ]),
            Line::from(""),
            Line::from("PR list and diff loading will use shared native review APIs."),
        ],
        None => vec![
            Line::from("Configure repositories in Lachesi settings first."),
            Line::from("This TUI reads the same non-secret settings file as the desktop app."),
        ],
    };

    let detail = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .block(Block::default().title("Review").borders(Borders::ALL));
    frame.render_widget(detail, area);
}

fn render_footer(frame: &mut Frame<'_>, area: Rect, status: &str) {
    let footer = Paragraph::new(Line::from(vec![
        Span::raw("q quit  "),
        Span::raw("j/k select repo  "),
        Span::raw(status),
    ]));
    frame.render_widget(footer, area);
}

fn provider_label(provider: ReviewProvider) -> &'static str {
    match provider {
        ReviewProvider::Bitbucket => "bitbucket",
        ReviewProvider::Github => "github",
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

        terminal
            .draw(|frame| {
                render(
                    frame,
                    TuiState {
                        repos: &repos,
                        selected_repo: 0,
                        status: "Ready",
                    },
                );
            })
            .expect("draw");

        let text = buffer_text(&terminal);
        assert!(text.contains("github lachesi-hq/lachesi"));
        assert!(text.contains("/tmp/lachesi"));
    }
}
