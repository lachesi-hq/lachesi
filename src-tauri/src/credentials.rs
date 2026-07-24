use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const SERVICE: &str = "app.lachesi.desktop";
const ACCOUNT: &str = "bitbucket";
const APP_DIR: &str = "lachesi";
const TERMINAL_CONFIG_FILE: &str = "config.toml";

#[derive(Serialize, Deserialize, Clone)]
pub struct Credentials {
    pub username: String,
    pub token: String,
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[derive(Default, Deserialize)]
struct TerminalConfig {
    credentials: Option<TerminalCredentialConfig>,
}

#[derive(Default, Deserialize)]
struct TerminalCredentialConfig {
    github: Option<TerminalGithubCredentials>,
    bitbucket: Option<TerminalBitbucketCredentials>,
}

#[derive(Default, Deserialize)]
struct TerminalGithubCredentials {
    token_env: Option<String>,
}

#[derive(Default, Deserialize)]
struct TerminalBitbucketCredentials {
    username_env: Option<String>,
    token_env: Option<String>,
}

fn terminal_config_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push(APP_DIR);
    Some(dir.join(TERMINAL_CONFIG_FILE))
}

fn parse_terminal_config(contents: &str) -> Result<TerminalConfig, String> {
    toml::from_str(contents).map_err(|e| e.to_string())
}

fn load_terminal_config() -> TerminalConfig {
    let Some(path) = terminal_config_path() else {
        return TerminalConfig::default();
    };
    load_terminal_config_from_path(&path).unwrap_or_default()
}

fn load_terminal_config_from_path(path: &Path) -> Result<TerminalConfig, String> {
    let contents = fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_terminal_config(&contents)
}

fn configured_env_value(env_name: Option<&str>) -> Option<String> {
    let env_name = env_name?.trim();
    if env_name.is_empty() {
        return None;
    }
    std::env::var(env_name)
        .ok()
        .filter(|value| !value.is_empty())
}

fn bitbucket_from_terminal_config(config: &TerminalConfig) -> Option<Credentials> {
    let bitbucket = config.credentials.as_ref()?.bitbucket.as_ref()?;
    let username = configured_env_value(bitbucket.username_env.as_deref())?;
    let token = configured_env_value(bitbucket.token_env.as_deref())?;
    Some(Credentials { username, token })
}

fn github_from_terminal_config(config: &TerminalConfig) -> Option<String> {
    let github = config.credentials.as_ref()?.github.as_ref()?;
    configured_env_value(github.token_env.as_deref())
}

/// Resolve credentials: keychain first, terminal config env refs, then
/// `BITBUCKET_*` env vars (dev fallback).
pub fn load() -> Option<Credentials> {
    if let Ok(entry) = entry() {
        if let Ok(secret) = entry.get_password() {
            if let Ok(creds) = serde_json::from_str::<Credentials>(&secret) {
                if !creds.username.is_empty() && !creds.token.is_empty() {
                    return Some(creds);
                }
            }
        }
    }

    if let Some(creds) = bitbucket_from_terminal_config(&load_terminal_config()) {
        return Some(creds);
    }

    let username = std::env::var("BITBUCKET_USERNAME").ok();
    let token = std::env::var("BITBUCKET_TOKEN").ok();
    if let (Some(username), Some(token)) = (username, token) {
        if !username.is_empty() && !token.is_empty() {
            return Some(Credentials { username, token });
        }
    }

    None
}

/// Store credentials in the OS keychain. Never called for env-sourced creds.
pub fn store(creds: &Credentials) -> Result<(), String> {
    let entry = entry()?;
    let json = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}

pub fn clear() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has() -> bool {
    load().is_some()
}

const ACCOUNT_JIRA: &str = "jira";
const ACCOUNT_NOTION: &str = "notion";
const ACCOUNT_GITHUB: &str = "github";

fn entry_for(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

fn load_token(account: &str, env_var: &str) -> Option<String> {
    if let Ok(entry) = entry_for(account) {
        if let Ok(secret) = entry.get_password() {
            if !secret.is_empty() {
                return Some(secret);
            }
        }
    }
    std::env::var(env_var).ok().filter(|s| !s.is_empty())
}

fn store_token(account: &str, token: &str) -> Result<(), String> {
    entry_for(account)?
        .set_password(token)
        .map_err(|e| e.to_string())
}

fn clear_token(account: &str) -> Result<(), String> {
    match entry_for(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn load_jira_token() -> Option<String> {
    load_token(ACCOUNT_JIRA, "JIRA_TOKEN")
}
pub fn store_jira_token(token: &str) -> Result<(), String> {
    store_token(ACCOUNT_JIRA, token)
}
pub fn clear_jira_token() -> Result<(), String> {
    clear_token(ACCOUNT_JIRA)
}
pub fn has_jira() -> bool {
    load_jira_token().is_some()
}

pub fn load_notion_token() -> Option<String> {
    load_token(ACCOUNT_NOTION, "NOTION_TOKEN")
}
pub fn store_notion_token(token: &str) -> Result<(), String> {
    store_token(ACCOUNT_NOTION, token)
}
pub fn clear_notion_token() -> Result<(), String> {
    clear_token(ACCOUNT_NOTION)
}
pub fn has_notion() -> bool {
    load_notion_token().is_some()
}

pub fn load_github_token() -> Option<String> {
    if let Ok(entry) = entry_for(ACCOUNT_GITHUB) {
        if let Ok(secret) = entry.get_password() {
            if !secret.is_empty() {
                return Some(secret);
            }
        }
    }
    github_from_terminal_config(&load_terminal_config())
        .or_else(|| std::env::var("GITHUB_TOKEN").ok().filter(|s| !s.is_empty()))
}
pub fn store_github_token(token: &str) -> Result<(), String> {
    store_token(ACCOUNT_GITHUB, token)
}
pub fn clear_github_token() -> Result<(), String> {
    clear_token(ACCOUNT_GITHUB)
}
pub fn has_github() -> bool {
    load_github_token().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_env(prefix: &str) -> String {
        format!("{prefix}_{}_{}", std::process::id(), line!())
    }

    #[test]
    fn terminal_config_resolves_bitbucket_env_refs() {
        let username_env = unique_env("LACHESI_TEST_BB_USER");
        let token_env = unique_env("LACHESI_TEST_BB_TOKEN");
        std::env::set_var(&username_env, "reviewer@example.com");
        std::env::set_var(&token_env, "bb-token");
        let config = parse_terminal_config(&format!(
            r#"
[credentials.bitbucket]
username_env = "{username_env}"
token_env = "{token_env}"
"#
        ))
        .expect("config");

        let creds = bitbucket_from_terminal_config(&config).expect("bitbucket credentials");

        assert_eq!(creds.username, "reviewer@example.com");
        assert_eq!(creds.token, "bb-token");
        std::env::remove_var(username_env);
        std::env::remove_var(token_env);
    }

    #[test]
    fn terminal_config_resolves_github_env_ref() {
        let token_env = unique_env("LACHESI_TEST_GH_TOKEN");
        std::env::set_var(&token_env, "gh-token");
        let config = parse_terminal_config(&format!(
            r#"
[credentials.github]
token_env = "{token_env}"
"#
        ))
        .expect("config");

        assert_eq!(
            github_from_terminal_config(&config).as_deref(),
            Some("gh-token")
        );
        std::env::remove_var(token_env);
    }

    #[test]
    fn terminal_config_ignores_missing_env_refs() {
        let config = parse_terminal_config(
            r#"
[credentials.github]
token_env = "LACHESI_TEST_GH_TOKEN_MISSING"
"#,
        )
        .expect("config");

        assert!(github_from_terminal_config(&config).is_none());
    }
}
