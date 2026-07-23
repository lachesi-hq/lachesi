mod render;
mod terminal;

use std::time::Duration;

use crossterm::event::{self, Event, KeyCode};

use crate::config::{self, RepoRef};
use render::{render, TuiState};
use terminal::TerminalGuard;

const TICK_RATE: Duration = Duration::from_millis(250);

pub fn run_from_env() -> Result<(), String> {
    let config = config::load();
    let mut app = TuiApp::from_repos(config.repos);
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
                Event::Key(key) => app.handle_key(key.code),
                Event::Resize(_, _) => {}
                _ => {}
            }
        }
    }

    Ok(())
}

#[derive(Clone)]
struct TuiApp {
    repos: Vec<RepoRef>,
    selected_repo: usize,
    should_quit: bool,
}

impl TuiApp {
    fn from_repos(repos: Vec<RepoRef>) -> Self {
        Self {
            repos,
            selected_repo: 0,
            should_quit: false,
        }
    }

    fn handle_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Char('q') | KeyCode::Esc => self.should_quit = true,
            KeyCode::Down | KeyCode::Char('j') => self.select_next_repo(),
            KeyCode::Up | KeyCode::Char('k') => self.select_previous_repo(),
            _ => {}
        }
    }

    fn select_next_repo(&mut self) {
        if self.repos.is_empty() {
            self.selected_repo = 0;
            return;
        }
        self.selected_repo = (self.selected_repo + 1).min(self.repos.len() - 1);
    }

    fn select_previous_repo(&mut self) {
        self.selected_repo = self.selected_repo.saturating_sub(1);
    }

    fn view_state(&self) -> TuiState<'_> {
        TuiState {
            repos: &self.repos,
            selected_repo: self.selected_repo,
            status: "Ready",
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
}
