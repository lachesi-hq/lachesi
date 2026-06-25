use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const APP_DIR: &str = "lachesi";
const CONFIG_FILE: &str = "settings.json";

/// A single Bitbucket repository the app tracks.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    pub workspace: String,
    pub repo: String,
    #[serde(default)]
    pub local_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewTerminal {
    #[serde(rename = "wezterm")]
    WezTerm,
    #[serde(rename = "iterm")]
    ITerm,
    #[serde(rename = "terminal")]
    Terminal,
}

/// Non-secret application configuration, persisted as JSON in the OS config dir.
/// Secrets (username/token) live in the keychain — see `credentials`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub repos: Vec<RepoRef>,
    pub default_diff_view: String,
    pub theme: String,
    #[serde(default)]
    pub review_terminal: Option<ReviewTerminal>,
    #[serde(default)]
    pub claude_model: Option<String>,
    #[serde(default)]
    pub claude_effort: Option<String>,
    /// Jira site base URL for issue links, e.g. https://example.atlassian.net
    #[serde(default)]
    pub jira_base_url: Option<String>,
    #[serde(default = "default_true")]
    pub menu_bar_sync_enabled: bool,
    #[serde(default)]
    pub notifications_enabled: bool,
    /// Derived at read time. Not persisted.
    #[serde(default, skip_serializing)]
    pub configured: bool,
    /// Derived at read time. Not persisted.
    #[serde(default, skip_serializing)]
    pub has_credentials: bool,
    #[serde(default, skip_serializing)]
    pub has_jira: bool,
    #[serde(default, skip_serializing)]
    pub has_notion: bool,
    /// Legacy single-repo fields, read for migration, never written back.
    #[serde(default, skip_serializing)]
    pub workspace: Option<String>,
    #[serde(default, skip_serializing)]
    pub repo: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            repos: Vec::new(),
            default_diff_view: "unified".to_string(),
            theme: "dark".to_string(),
            review_terminal: None,
            claude_model: None,
            claude_effort: None,
            jira_base_url: None,
            menu_bar_sync_enabled: true,
            notifications_enabled: false,
            configured: false,
            has_credentials: false,
            has_jira: false,
            has_notion: false,
            workspace: None,
            repo: None,
        }
    }
}

fn default_true() -> bool {
    true
}

fn config_dir() -> Result<PathBuf, String> {
    let mut dir =
        dirs::config_dir().ok_or_else(|| "could not resolve config directory".to_string())?;
    dir.push(APP_DIR);
    Ok(dir)
}

fn config_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join(CONFIG_FILE))
}

/// Read config from disk, migrating the legacy single-repo shape if present.
pub fn load() -> AppConfig {
    let mut cfg = match config_path() {
        Ok(path) => match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        },
        Err(_) => AppConfig::default(),
    };

    if cfg.repos.is_empty() {
        if let (Some(ws), Some(repo)) = (cfg.workspace.clone(), cfg.repo.clone()) {
            if !ws.is_empty() && !repo.is_empty() {
                cfg.repos.push(RepoRef {
                    workspace: ws,
                    repo,
                    local_path: None,
                });
            }
        }
    }
    cfg.workspace = None;
    cfg.repo = None;
    cfg
}

/// Persist the non-secret config fields to disk.
pub fn save(cfg: &AppConfig) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(dir.join(CONFIG_FILE), json).map_err(|e| e.to_string())
}
