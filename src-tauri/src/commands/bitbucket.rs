use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;

use crate::config::{self, AppConfig, RepoRef};
use crate::config::{AiProvider, ReviewTerminal};
use crate::credentials::{self, Credentials};
use crate::repo_config::{self, RepoReviewConfigLoadResult};
use crate::review_storage::{self, ClosedPrMetric};

const BASE: &str = "https://api.bitbucket.org/2.0";

/// When `LACHESI_DRY_RUN` is truthy, comment-creating commands log and return a
/// synthetic comment instead of POSTing — lets the full UI flow run against live
/// read data without writing to a shared repo.
fn dry_run() -> bool {
    std::env::var("LACHESI_DRY_RUN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

struct BitbucketClient {
    username: String,
    token: String,
    http: reqwest::blocking::Client,
}

impl BitbucketClient {
    fn new(creds: Credentials) -> Result<Self, String> {
        let http = reqwest::blocking::Client::builder()
            .user_agent("lachesi")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            username: creds.username,
            token: creds.token,
            http,
        })
    }

    fn from_stored() -> Result<Self, String> {
        let creds = credentials::load().ok_or_else(|| {
            "No Bitbucket credentials configured. Open Settings to add them.".to_string()
        })?;
        Self::new(creds)
    }

    fn get(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.http
            .get(url)
            .basic_auth(&self.username, Some(&self.token))
    }

    fn post(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.http
            .post(url)
            .basic_auth(&self.username, Some(&self.token))
    }

    fn delete(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.http
            .delete(url)
            .basic_auth(&self.username, Some(&self.token))
    }
}

fn repo_base(workspace: &str, repo: &str) -> Result<String, String> {
    if workspace.trim().is_empty() || repo.trim().is_empty() {
        return Err("Bitbucket workspace/repo is required.".to_string());
    }
    Ok(format!("{BASE}/repositories/{workspace}/{repo}"))
}

fn check(resp: reqwest::blocking::Response) -> Result<reqwest::blocking::Response, String> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().unwrap_or_default();
    Err(format!("Bitbucket API error {status}: {body}"))
}

/// Send a request, retrying on 429 (honoring `Retry-After`) and transient 5xx
/// with bounded exponential backoff, then surface non-success as an error.
fn send_checked(
    req: reqwest::blocking::RequestBuilder,
) -> Result<reqwest::blocking::Response, String> {
    let mut attempt: u32 = 0;
    loop {
        let this = req
            .try_clone()
            .ok_or_else(|| "request is not retryable".to_string())?;
        let resp = this.send().map_err(|e| e.to_string())?;
        let status = resp.status();
        let retryable = status.as_u16() == 429 || status.is_server_error();
        if retryable && attempt < 3 {
            let wait = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(1u64 << attempt);
            std::thread::sleep(std::time::Duration::from_secs(wait.min(10)));
            attempt += 1;
            continue;
        }
        return check(resp);
    }
}

fn get_json<T: DeserializeOwned>(req: reqwest::blocking::RequestBuilder) -> Result<T, String> {
    let resp = send_checked(req)?;
    resp.json::<T>().map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct BbCommitPage {
    #[serde(default)]
    values: Vec<serde::de::IgnoredAny>,
    next: Option<String>,
}

/// Count commits reachable from `include` but not `exclude`, capped. Returns
/// (count, capped) where `capped` means there were more than `cap`.
fn count_commits(
    client: &BitbucketClient,
    base: &str,
    include: &str,
    exclude: &str,
    cap: u32,
) -> Result<(u32, bool), String> {
    let pagelen = cap.to_string();
    let url = format!("{base}/commits");
    let page: BbCommitPage = get_json(client.get(&url).query(&[
        ("include", include),
        ("exclude", exclude),
        ("pagelen", pagelen.as_str()),
        ("fields", "values.hash,next"),
    ]))?;
    Ok((page.values.len() as u32, page.next.is_some()))
}

/// Run blocking work on a worker thread so the webview never stalls.
async fn run<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Bitbucket wire structs (deserialize only what we use)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BbAuthor {
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    account_id: Option<String>,
}

#[derive(Deserialize)]
struct BbBranch {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize)]
struct BbBranchRef {
    branch: Option<BbBranch>,
}

#[derive(Deserialize)]
struct BbPrSummary {
    id: u32,
    #[serde(default)]
    title: String,
    author: Option<BbAuthor>,
    source: Option<BbBranchRef>,
    destination: Option<BbBranchRef>,
    #[serde(default)]
    state: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    comment_count: u32,
    #[serde(default)]
    created_on: String,
    #[serde(default)]
    updated_on: String,
    #[serde(default)]
    participants: Vec<BbParticipant>,
}

#[derive(Deserialize)]
struct BbPrPage {
    #[serde(default)]
    values: Vec<BbPrSummary>,
    #[serde(default)]
    size: u32,
    #[serde(default)]
    page: u32,
    next: Option<String>,
}

#[derive(Deserialize)]
struct BbParticipant {
    #[serde(default)]
    role: String,
    #[serde(default)]
    approved: bool,
    user: Option<BbAuthor>,
}

#[derive(Deserialize)]
struct BbPrDetail {
    id: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    draft: bool,
    author: Option<BbAuthor>,
    source: Option<BbBranchRef>,
    destination: Option<BbBranchRef>,
    #[serde(default)]
    created_on: String,
    #[serde(default)]
    updated_on: String,
    #[serde(default)]
    participants: Vec<BbParticipant>,
}

#[derive(Deserialize)]
struct BbDiffstatFile {
    #[serde(default)]
    path: String,
}

#[derive(Deserialize)]
struct BbDiffstat {
    #[serde(default)]
    status: String,
    #[serde(default)]
    lines_added: u32,
    #[serde(default)]
    lines_removed: u32,
    old: Option<BbDiffstatFile>,
    new: Option<BbDiffstatFile>,
}

#[derive(Deserialize)]
struct BbDiffstatPage {
    #[serde(default)]
    values: Vec<BbDiffstat>,
    next: Option<String>,
}

#[derive(Deserialize)]
struct BbContent {
    #[serde(default)]
    raw: String,
    html: Option<String>,
}

#[derive(Deserialize)]
struct BbInline {
    #[serde(default)]
    path: String,
    to: Option<u32>,
    from: Option<u32>,
}

#[derive(Deserialize)]
struct BbParent {
    id: u32,
}

#[derive(Deserialize)]
struct BbComment {
    id: u32,
    content: Option<BbContent>,
    user: Option<BbAuthor>,
    #[serde(default)]
    created_on: String,
    #[serde(default)]
    deleted: bool,
    inline: Option<BbInline>,
    parent: Option<BbParent>,
}

#[derive(Deserialize)]
struct BbCommentPage {
    #[serde(default)]
    values: Vec<BbComment>,
    next: Option<String>,
}

#[derive(Deserialize)]
struct BbUser {
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    account_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Output structs (camelCase to match the TS DTOs)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    id: u32,
    title: String,
    author_display_name: String,
    author_account_id: Option<String>,
    source_branch: String,
    destination_branch: String,
    state: String,
    draft: bool,
    comment_count: u32,
    created_on: String,
    updated_on: String,
    reviewers: Vec<Participant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestPage {
    values: Vec<PullRequestSummary>,
    size: u32,
    page: u32,
    has_next: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    display_name: String,
    account_id: Option<String>,
    role: String,
    approved: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDetail {
    id: u32,
    title: String,
    description_raw: String,
    state: String,
    draft: bool,
    author_display_name: String,
    reviewers: Vec<Participant>,
    source_branch: String,
    destination_branch: String,
    created_on: String,
    updated_on: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffstatEntry {
    status: String,
    lines_added: u32,
    lines_removed: u32,
    old_path: Option<String>,
    new_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClosedPrAnalyticsSnapshot {
    metrics: Vec<ClosedPrMetric>,
    synced_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineAnchor {
    path: String,
    to: Option<u32>,
    from: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    id: u32,
    parent_id: Option<u32>,
    content_raw: String,
    content_html: Option<String>,
    user_display_name: String,
    created_on: String,
    deleted: bool,
    inline: Option<InlineAnchor>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUser {
    display_name: String,
    account_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchStatus {
    /// Commits on the destination branch not in the source (how far behind).
    behind: u32,
    /// Commits on the source branch not in the destination (the PR's own work).
    ahead: u32,
    behind_capped: bool,
    ahead_capped: bool,
}

// ---------------------------------------------------------------------------
// Input structs
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListPrOptions {
    state: Option<String>,
    page: Option<u32>,
    pagelen: Option<u32>,
    query: Option<String>,
    updated_after: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClosedPrAnalyticsOptions {
    limit_per_state: Option<u32>,
    updated_after: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInlineComment {
    path: String,
    to: Option<u32>,
    from: Option<u32>,
    raw: String,
    parent_id: Option<u32>,
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

fn branch_name(r: Option<BbBranchRef>) -> String {
    r.and_then(|r| r.branch).map(|b| b.name).unwrap_or_default()
}

fn map_reviewers(participants: Vec<BbParticipant>) -> Vec<Participant> {
    participants
        .into_iter()
        .filter(|p| p.role.eq_ignore_ascii_case("REVIEWER"))
        .map(|p| {
            let (display_name, account_id) = match p.user {
                Some(user) => (user.display_name, user.account_id),
                None => (String::new(), None),
            };
            Participant {
                display_name,
                account_id,
                role: p.role,
                approved: p.approved,
            }
        })
        .collect()
}

fn map_pr_summary(p: BbPrSummary) -> PullRequestSummary {
    let (author_display_name, author_account_id) = match p.author {
        Some(a) => (a.display_name, a.account_id),
        None => (String::new(), None),
    };
    PullRequestSummary {
        id: p.id,
        title: p.title,
        author_display_name,
        author_account_id,
        source_branch: branch_name(p.source),
        destination_branch: branch_name(p.destination),
        state: p.state,
        draft: p.draft,
        comment_count: p.comment_count,
        created_on: p.created_on,
        updated_on: p.updated_on,
        reviewers: map_reviewers(p.participants),
    }
}

fn map_diffstat(d: BbDiffstat) -> DiffstatEntry {
    DiffstatEntry {
        status: d.status,
        lines_added: d.lines_added,
        lines_removed: d.lines_removed,
        old_path: d.old.map(|f| f.path),
        new_path: d.new.map(|f| f.path),
    }
}

fn map_comment(c: BbComment) -> PrComment {
    let (content_raw, content_html) = match c.content {
        Some(content) => (content.raw, content.html),
        None => (String::new(), None),
    };
    PrComment {
        id: c.id,
        parent_id: c.parent.map(|p| p.id),
        content_raw,
        content_html,
        user_display_name: c.user.map(|u| u.display_name).unwrap_or_default(),
        created_on: c.created_on,
        deleted: c.deleted,
        inline: c.inline.map(|i| InlineAnchor {
            path: i.path,
            to: i.to,
            from: i.from,
        }),
    }
}

fn map_pr_detail(bb: BbPrDetail) -> PullRequestDetail {
    let reviewers = map_reviewers(bb.participants);
    PullRequestDetail {
        id: bb.id,
        title: bb.title,
        description_raw: bb.description,
        state: bb.state,
        draft: bb.draft,
        author_display_name: bb.author.map(|a| a.display_name).unwrap_or_default(),
        reviewers,
        source_branch: branch_name(bb.source),
        destination_branch: branch_name(bb.destination),
        created_on: bb.created_on,
        updated_on: bb.updated_on,
    }
}

fn fetch_pull_request_detail(
    client: &BitbucketClient,
    workspace: &str,
    repo: &str,
    id: u32,
) -> Result<PullRequestDetail, String> {
    let url = format!("{}/pullrequests/{id}", repo_base(workspace, repo)?);
    let bb: BbPrDetail = get_json(client.get(&url))?;
    Ok(map_pr_detail(bb))
}

fn now_ms() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn query_literal(value: &str) -> String {
    value.replace(['\\', '"'], "")
}

fn pr_query_filter(opts: &ListPrOptions) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(q) = opts.query.as_ref().filter(|q| !q.is_empty()) {
        parts.push(format!("title ~ \"{}\"", query_literal(q)));
    }
    if let Some(updated_after) = opts
        .updated_after
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        parts.push(format!(
            "updated_on >= \"{}\"",
            query_literal(updated_after)
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" AND "))
    }
}

fn fetch_pull_requests_page(
    client: &BitbucketClient,
    workspace: &str,
    repo: &str,
    opts: &ListPrOptions,
) -> Result<PullRequestPage, String> {
    let url = format!("{}/pullrequests", repo_base(workspace, repo)?);
    let page = opts.page.unwrap_or(1);
    let pagelen = opts.pagelen.unwrap_or(30);
    let mut query: Vec<(String, String)> = vec![
        ("page".into(), page.to_string()),
        ("pagelen".into(), pagelen.to_string()),
        (
            "fields".into(),
            "size,page,next,values.id,values.title,values.state,values.draft,values.comment_count,values.created_on,values.updated_on,values.author.display_name,values.author.account_id,values.source.branch.name,values.destination.branch.name,values.participants.role,values.participants.approved,values.participants.user.display_name,values.participants.user.account_id".into(),
        ),
    ];
    match opts.state.as_deref() {
        Some("ALL") => {
            for s in ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"] {
                query.push(("state".into(), s.into()));
            }
        }
        Some(s) => query.push(("state".into(), s.to_string())),
        None => query.push(("state".into(), "OPEN".into())),
    }
    if let Some(filter) = pr_query_filter(opts) {
        query.push(("q".into(), filter));
    }
    let bb: BbPrPage = get_json(client.get(&url).query(&query))?;
    Ok(PullRequestPage {
        values: bb.values.into_iter().map(map_pr_summary).collect(),
        size: bb.size,
        page: bb.page.max(1),
        has_next: bb.next.is_some(),
    })
}

fn fetch_diffstat_entries(
    client: &BitbucketClient,
    workspace: &str,
    repo: &str,
    id: u32,
) -> Result<Vec<DiffstatEntry>, String> {
    let mut url = format!(
        "{}/pullrequests/{id}/diffstat?pagelen=100",
        repo_base(workspace, repo)?
    );
    let mut out = Vec::new();
    loop {
        let page: BbDiffstatPage = get_json(client.get(&url))?;
        out.extend(page.values.into_iter().map(map_diffstat));
        match page.next {
            Some(next) => url = next,
            None => break,
        }
    }
    Ok(out)
}

fn cached_closed_metrics_for_repos(repos: &[RepoRef]) -> Result<Vec<ClosedPrMetric>, String> {
    if repos.is_empty() {
        return Ok(Vec::new());
    }
    let metrics = review_storage::list_closed_pr_metrics()?;
    Ok(metrics
        .into_iter()
        .filter(|metric| {
            repos
                .iter()
                .any(|repo| repo.workspace == metric.workspace && repo.repo == metric.repo)
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Commands — connection / config / credentials
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let mut cfg = config::load();
    cfg.configured = !cfg.repos.is_empty();
    cfg.has_credentials = credentials::has();
    cfg.has_jira = credentials::has_jira();
    cfg.has_notion = credentials::has_notion();
    Ok(cfg)
}

#[tauri::command]
pub fn validate_repo_review_config(
    repo_path: String,
) -> Result<RepoReviewConfigLoadResult, String> {
    repo_config::load_from_repo_path(Path::new(&repo_path))
}

#[tauri::command]
pub fn save_config(
    repos: Vec<RepoRef>,
    default_diff_view: String,
    theme: String,
    review_terminal: Option<ReviewTerminal>,
    ai_provider: AiProvider,
    claude_model: Option<String>,
    claude_effort: Option<String>,
    codex_model: Option<String>,
    codex_effort: Option<String>,
    jira_base_url: Option<String>,
    automatic_sync_interval_seconds: Option<u64>,
    menu_bar_sync_enabled: bool,
    notifications_enabled: bool,
) -> Result<(), String> {
    config::save(&AppConfig {
        repos,
        default_diff_view,
        theme,
        review_terminal,
        ai_provider,
        claude_model,
        claude_effort,
        codex_model,
        codex_effort,
        jira_base_url,
        automatic_sync_interval_seconds,
        menu_bar_sync_enabled,
        notifications_enabled,
        configured: false,
        has_credentials: false,
        has_jira: false,
        has_notion: false,
        workspace: None,
        repo: None,
    })
}

#[tauri::command]
pub fn save_credentials(username: String, token: String) -> Result<(), String> {
    credentials::store(&Credentials { username, token })
}

#[tauri::command]
pub fn has_credentials() -> Result<bool, String> {
    Ok(credentials::has())
}

#[tauri::command]
pub fn clear_credentials() -> Result<(), String> {
    credentials::clear()
}

#[tauri::command]
pub fn save_jira_token(token: String) -> Result<(), String> {
    if token.trim().is_empty() {
        credentials::clear_jira_token()
    } else {
        credentials::store_jira_token(token.trim())
    }
}

#[tauri::command]
pub fn save_notion_token(token: String) -> Result<(), String> {
    if token.trim().is_empty() {
        credentials::clear_notion_token()
    } else {
        credentials::store_notion_token(token.trim())
    }
}

#[tauri::command]
pub async fn test_connection(username: String, token: String) -> Result<WorkspaceUser, String> {
    run(move || {
        let client = BitbucketClient::new(Credentials { username, token })?;
        let user: BbUser = get_json(client.get(&format!("{BASE}/user")))?;
        Ok(WorkspaceUser {
            display_name: user.display_name,
            account_id: user.account_id,
        })
    })
    .await
}

#[tauri::command]
pub async fn get_current_user() -> Result<WorkspaceUser, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        let user: BbUser = get_json(client.get(&format!("{BASE}/user")))?;
        Ok(WorkspaceUser {
            display_name: user.display_name,
            account_id: user.account_id,
        })
    })
    .await
}

// ---------------------------------------------------------------------------
// Commands — pull requests
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_pull_requests(
    workspace: String,
    repo: String,
    opts: ListPrOptions,
) -> Result<PullRequestPage, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        fetch_pull_requests_page(&client, &workspace, &repo, &opts)
    })
    .await
}

#[tauri::command]
pub async fn list_closed_pr_metrics(
    repos: Vec<RepoRef>,
) -> Result<ClosedPrAnalyticsSnapshot, String> {
    run(move || {
        Ok(ClosedPrAnalyticsSnapshot {
            metrics: cached_closed_metrics_for_repos(&repos)?,
            synced_count: 0,
        })
    })
    .await
}

#[tauri::command]
pub async fn sync_closed_pr_metrics(
    repos: Vec<RepoRef>,
    options: ClosedPrAnalyticsOptions,
) -> Result<ClosedPrAnalyticsSnapshot, String> {
    run(move || {
        if repos.is_empty() {
            return Ok(ClosedPrAnalyticsSnapshot {
                metrics: Vec::new(),
                synced_count: 0,
            });
        }

        let client = BitbucketClient::from_stored()?;
        let limit = options.limit_per_state.unwrap_or(25).clamp(1, 100);
        let states = ["MERGED", "DECLINED", "SUPERSEDED"];
        let mut synced_count = 0;

        for repo_ref in &repos {
            for state in states {
                let page = fetch_pull_requests_page(
                    &client,
                    &repo_ref.workspace,
                    &repo_ref.repo,
                    &ListPrOptions {
                        state: Some(state.to_string()),
                        page: Some(1),
                        pagelen: Some(limit),
                        query: None,
                        updated_after: options.updated_after.clone(),
                    },
                )?;

                for pr in page.values {
                    let diffstat =
                        fetch_diffstat_entries(&client, &repo_ref.workspace, &repo_ref.repo, pr.id);
                    let (additions, deletions, files_changed, diffstat_cached) = match diffstat {
                        Ok(entries) => {
                            let additions = entries.iter().map(|entry| entry.lines_added).sum();
                            let deletions = entries.iter().map(|entry| entry.lines_removed).sum();
                            (additions, deletions, entries.len() as u32, true)
                        }
                        Err(error) => {
                            eprintln!(
                                "Failed to sync diffstat for {}/{} #{}: {}",
                                repo_ref.workspace, repo_ref.repo, pr.id, error
                            );
                            (0, 0, 0, false)
                        }
                    };
                    let risk = review_storage::review_risk_summary(
                        &repo_ref.workspace,
                        &repo_ref.repo,
                        pr.id,
                        additions,
                        deletions,
                        files_changed,
                    );
                    review_storage::upsert_closed_pr_metric(&ClosedPrMetric {
                        workspace: repo_ref.workspace.clone(),
                        repo: repo_ref.repo.clone(),
                        pr_id: pr.id,
                        title: pr.title,
                        author_display_name: pr.author_display_name,
                        author_account_id: pr.author_account_id,
                        state: pr.state,
                        source_branch: pr.source_branch,
                        destination_branch: pr.destination_branch,
                        created_on: pr.created_on,
                        updated_on: pr.updated_on,
                        additions,
                        deletions,
                        files_changed,
                        diffstat_cached,
                        risk,
                        synced_at: now_ms(),
                    })?;
                    synced_count += 1;
                }
            }
        }

        Ok(ClosedPrAnalyticsSnapshot {
            metrics: cached_closed_metrics_for_repos(&repos)?,
            synced_count,
        })
    })
    .await
}

#[tauri::command]
pub async fn get_pull_request(
    workspace: String,
    repo: String,
    id: u32,
) -> Result<PullRequestDetail, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        fetch_pull_request_detail(&client, &workspace, &repo, id)
    })
    .await
}

#[tauri::command]
pub async fn approve_pull_request(
    workspace: String,
    repo: String,
    id: u32,
) -> Result<PullRequestDetail, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        if !dry_run() {
            let url = format!(
                "{}/pullrequests/{id}/approve",
                repo_base(&workspace, &repo)?
            );
            send_checked(client.post(&url))?;
        } else {
            eprintln!("[dry-run] approve PR #{id}");
        }
        fetch_pull_request_detail(&client, &workspace, &repo, id)
    })
    .await
}

#[tauri::command]
pub async fn get_branch_status(
    workspace: String,
    repo: String,
    source: String,
    destination: String,
) -> Result<BranchStatus, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        let base = repo_base(&workspace, &repo)?;
        let (behind, behind_capped) = count_commits(&client, &base, &destination, &source, 100)?;
        let (ahead, ahead_capped) = count_commits(&client, &base, &source, &destination, 100)?;
        Ok(BranchStatus {
            behind,
            ahead,
            behind_capped,
            ahead_capped,
        })
    })
    .await
}

#[tauri::command]
pub async fn get_diffstat(
    workspace: String,
    repo: String,
    id: u32,
) -> Result<Vec<DiffstatEntry>, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        fetch_diffstat_entries(&client, &workspace, &repo, id)
    })
    .await
}

#[tauri::command]
pub async fn get_pr_diff(workspace: String, repo: String, id: u32) -> Result<String, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        let url = format!("{}/pullrequests/{id}/diff", repo_base(&workspace, &repo)?);
        let resp = send_checked(client.get(&url))?;
        resp.text().map_err(|e| e.to_string())
    })
    .await
}

// ---------------------------------------------------------------------------
// Commands — comments
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_comments(
    workspace: String,
    repo: String,
    id: u32,
) -> Result<Vec<PrComment>, String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        let mut url = format!(
            "{}/pullrequests/{id}/comments?pagelen=100&fields=next,values.id,values.created_on,values.deleted,values.content.raw,values.content.html,values.user.display_name,values.inline.path,values.inline.to,values.inline.from,values.parent.id",
            repo_base(&workspace, &repo)?
        );
        let mut out = Vec::new();
        loop {
            let page: BbCommentPage = get_json(client.get(&url))?;
            out.extend(page.values.into_iter().map(map_comment));
            match page.next {
                Some(next) => url = next,
                None => break,
            }
        }
        Ok(out)
    })
    .await
}

#[tauri::command]
pub async fn create_inline_comment(
    workspace: String,
    repo: String,
    id: u32,
    req: NewInlineComment,
) -> Result<PrComment, String> {
    run(move || {
        if dry_run() {
            eprintln!(
                "[dry-run] inline comment on PR #{id} {}: {}",
                req.path, req.raw
            );
            return Ok(PrComment {
                id: 0,
                parent_id: req.parent_id,
                content_raw: req.raw,
                content_html: None,
                user_display_name: "dry-run".to_string(),
                created_on: String::new(),
                deleted: false,
                inline: Some(InlineAnchor {
                    path: req.path,
                    to: req.to,
                    from: req.from,
                }),
            });
        }
        let client = BitbucketClient::from_stored()?;
        let url = format!(
            "{}/pullrequests/{id}/comments",
            repo_base(&workspace, &repo)?
        );
        let mut inline = serde_json::Map::new();
        inline.insert("path".into(), json!(req.path));
        if let Some(to) = req.to {
            inline.insert("to".into(), json!(to));
        }
        if let Some(from) = req.from {
            inline.insert("from".into(), json!(from));
        }
        let mut body = json!({ "content": { "raw": req.raw }, "inline": inline });
        if let Some(parent_id) = req.parent_id {
            body["parent"] = json!({ "id": parent_id });
        }
        let bb: BbComment = get_json(client.post(&url).json(&body))?;
        Ok(map_comment(bb))
    })
    .await
}

#[tauri::command]
pub async fn create_general_comment(
    workspace: String,
    repo: String,
    id: u32,
    raw: String,
    parent_id: Option<u32>,
) -> Result<PrComment, String> {
    run(move || {
        if dry_run() {
            eprintln!("[dry-run] general comment on PR #{id}: {raw}");
            return Ok(PrComment {
                id: 0,
                parent_id,
                content_raw: raw,
                content_html: None,
                user_display_name: "dry-run".to_string(),
                created_on: String::new(),
                deleted: false,
                inline: None,
            });
        }
        let client = BitbucketClient::from_stored()?;
        let url = format!(
            "{}/pullrequests/{id}/comments",
            repo_base(&workspace, &repo)?
        );
        let mut body = json!({ "content": { "raw": raw } });
        if let Some(parent_id) = parent_id {
            body["parent"] = json!({ "id": parent_id });
        }
        let bb: BbComment = get_json(client.post(&url).json(&body))?;
        Ok(map_comment(bb))
    })
    .await
}

#[tauri::command]
pub async fn delete_comment(
    workspace: String,
    repo: String,
    id: u32,
    comment_id: u32,
) -> Result<(), String> {
    run(move || {
        let client = BitbucketClient::from_stored()?;
        let url = format!(
            "{}/pullrequests/{id}/comments/{comment_id}",
            repo_base(&workspace, &repo)?
        );
        send_checked(client.delete(&url))?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pr_query_filter_combines_title_and_updated_window() {
        let opts = ListPrOptions {
            state: Some("MERGED".to_string()),
            page: Some(1),
            pagelen: Some(10),
            query: Some("payment".to_string()),
            updated_after: Some("2026-06-01T00:00:00.000Z".to_string()),
        };

        assert_eq!(
            pr_query_filter(&opts),
            Some("title ~ \"payment\" AND updated_on >= \"2026-06-01T00:00:00.000Z\"".to_string(),),
        );
    }

    #[test]
    fn pr_query_filter_sanitizes_literals() {
        let opts = ListPrOptions {
            state: None,
            page: None,
            pagelen: None,
            query: Some("quote\" slash\\".to_string()),
            updated_after: Some("2026-06-01T00:00:00.000Z\"".to_string()),
        };

        assert_eq!(
            pr_query_filter(&opts),
            Some(
                "title ~ \"quote slash\" AND updated_on >= \"2026-06-01T00:00:00.000Z\""
                    .to_string(),
            ),
        );
    }
}
