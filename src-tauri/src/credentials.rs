use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.lachesi.desktop";
const ACCOUNT: &str = "bitbucket";

#[derive(Serialize, Deserialize, Clone)]
pub struct Credentials {
    pub username: String,
    pub token: String,
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Resolve credentials: keychain first, then `BITBUCKET_*` env vars (dev fallback).
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
    load_token(ACCOUNT_GITHUB, "GITHUB_TOKEN")
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
