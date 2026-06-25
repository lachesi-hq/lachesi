use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const APP_DIR: &str = "lachesi";
const DB_FILE: &str = "lachesi.sqlite3";
const LEGACY_REVIEWS_DIR: &str = "reviews";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewJobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl ReviewJobStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "queued" => Self::Queued,
            "succeeded" => Self::Succeeded,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            _ => Self::Running,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewJob {
    pub id: String,
    pub workspace: String,
    pub repo: String,
    pub pr_id: u32,
    pub pr_title: String,
    pub source_branch: String,
    pub destination_branch: String,
    pub status: ReviewJobStatus,
    pub trigger: String,
    pub thread_id: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReviewStore {
    #[serde(default)]
    threads: Vec<StoredReviewThread>,
    #[serde(default)]
    review_runs: Vec<StoredReviewRun>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReviewThread {
    id: String,
    title: String,
    created_at: String,
    #[serde(default)]
    messages: Vec<StoredReviewMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReviewMessage {
    role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReviewRun {
    status: String,
    source_branch: String,
    destination_branch: String,
    created_at: String,
    finished_at: Option<String>,
    thread_id: Option<String>,
}

fn local_data_dir() -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("LACHESI_DATA_DIR") {
        let dir = PathBuf::from(dir);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(dir);
    }
    let dir = dirs::data_local_dir()
        .ok_or_else(|| "Cannot determine local data directory".to_string())?
        .join(APP_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn legacy_reviews_dir() -> Result<PathBuf, String> {
    let dir = local_data_dir()?.join(LEGACY_REVIEWS_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn legacy_review_file_name(workspace: &str, repo: &str, id: u32) -> String {
    format!("{workspace}_{repo}_{id}.json")
}

pub fn legacy_review_path(workspace: &str, repo: &str, id: u32) -> Result<PathBuf, String> {
    Ok(legacy_reviews_dir()?.join(legacy_review_file_name(workspace, repo, id)))
}

fn db_path() -> Result<PathBuf, String> {
    Ok(local_data_dir()?.join(DB_FILE))
}

fn review_key(workspace: &str, repo: &str, id: u32) -> String {
    format!("{workspace}_{repo}_{id}")
}

fn open() -> Result<Connection, String> {
    let conn = Connection::open(db_path()?).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (strftime('%s','now') || '000')
        );

        CREATE TABLE IF NOT EXISTS ai_review_stores (
          review_key TEXT PRIMARY KEY,
          workspace TEXT NOT NULL,
          repo TEXT NOT NULL,
          pr_id INTEGER NOT NULL,
          store_json TEXT NOT NULL,
          migrated_from_json INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_review_stores_repo
          ON ai_review_stores(workspace, repo, pr_id);

        CREATE TABLE IF NOT EXISTS ai_review_jobs (
          id TEXT PRIMARY KEY,
          workspace TEXT NOT NULL,
          repo TEXT NOT NULL,
          pr_id INTEGER NOT NULL,
          pr_title TEXT NOT NULL,
          source_branch TEXT NOT NULL,
          destination_branch TEXT NOT NULL,
          status TEXT NOT NULL,
          trigger TEXT NOT NULL,
          thread_id TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_ai_review_jobs_status
          ON ai_review_jobs(status, created_at);

        CREATE INDEX IF NOT EXISTS idx_ai_review_jobs_pr
          ON ai_review_jobs(workspace, repo, pr_id, created_at);
        "#,
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn now_ms() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub fn load_review_json(workspace: &str, repo: &str, id: u32) -> Result<Option<String>, String> {
    let conn = open()?;
    let key = review_key(workspace, repo, id);
    let db_json = conn
        .query_row(
            "SELECT store_json FROM ai_review_stores WHERE review_key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if db_json.is_some() {
        return Ok(db_json);
    }

    let legacy_path = legacy_review_path(workspace, repo, id)?;
    if !legacy_path.exists() {
        return Ok(None);
    }
    let legacy_json = fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
    save_review_json_with_migration_flag(workspace, repo, id, &legacy_json, true)?;
    Ok(Some(legacy_json))
}

pub fn save_review_json(workspace: &str, repo: &str, id: u32, json: &str) -> Result<(), String> {
    save_review_json_with_migration_flag(workspace, repo, id, json, false)
}

fn save_review_json_with_migration_flag(
    workspace: &str,
    repo: &str,
    id: u32,
    json: &str,
    migrated_from_json: bool,
) -> Result<(), String> {
    let conn = open()?;
    let key = review_key(workspace, repo, id);
    let now = now_ms();
    conn.execute(
        r#"
        INSERT INTO ai_review_stores (
          review_key, workspace, repo, pr_id, store_json, migrated_from_json, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        ON CONFLICT(review_key) DO UPDATE SET
          store_json = excluded.store_json,
          migrated_from_json = ai_review_stores.migrated_from_json OR excluded.migrated_from_json,
          updated_at = excluded.updated_at
        "#,
        params![
            key,
            workspace,
            repo,
            i64::from(id),
            json,
            if migrated_from_json { 1 } else { 0 },
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_review(workspace: &str, repo: &str, id: u32) -> Result<(), String> {
    let conn = open()?;
    let key = review_key(workspace, repo, id);
    conn.execute(
        "DELETE FROM ai_review_stores WHERE review_key = ?1",
        params![key],
    )
    .map_err(|e| e.to_string())?;
    if let Ok(path) = legacy_review_path(workspace, repo, id) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

pub fn cleanup_stale_reviews(keep_keys: &[String]) -> Result<(), String> {
    let conn = open()?;
    if keep_keys.is_empty() {
        conn.execute("DELETE FROM ai_review_stores", [])
            .map_err(|e| e.to_string())?;
    } else {
        let mut stmt = conn
            .prepare("SELECT review_key FROM ai_review_stores")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let key = row.map_err(|e| e.to_string())?;
            if !keep_keys.contains(&key) {
                conn.execute(
                    "DELETE FROM ai_review_stores WHERE review_key = ?1",
                    params![key],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    cleanup_legacy_review_files(keep_keys)?;
    Ok(())
}

pub fn create_review_job(
    workspace: &str,
    repo: &str,
    pr_id: u32,
    pr_title: &str,
    source_branch: &str,
    destination_branch: &str,
    trigger: &str,
) -> Result<ReviewJob, String> {
    let conn = open()?;
    let now = now_ms();
    let job = ReviewJob {
        id: format!("job-{}", now),
        workspace: workspace.to_string(),
        repo: repo.to_string(),
        pr_id,
        pr_title: pr_title.to_string(),
        source_branch: source_branch.to_string(),
        destination_branch: destination_branch.to_string(),
        status: ReviewJobStatus::Queued,
        trigger: trigger.to_string(),
        thread_id: None,
        error: None,
        created_at: now,
        started_at: None,
        finished_at: None,
    };
    conn.execute(
        r#"
        INSERT INTO ai_review_jobs (
          id, workspace, repo, pr_id, pr_title, source_branch, destination_branch,
          status, trigger, thread_id, error, created_at, started_at, finished_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        "#,
        params![
            job.id,
            job.workspace,
            job.repo,
            i64::from(job.pr_id),
            job.pr_title,
            job.source_branch,
            job.destination_branch,
            job.status.as_str(),
            job.trigger,
            job.thread_id,
            job.error,
            job.created_at,
            job.started_at,
            job.finished_at
        ],
    )
    .map_err(|e| e.to_string())?;
    get_review_job(&job.id)?.ok_or_else(|| "Failed to reload created review job.".to_string())
}

pub fn update_review_job_status(
    id: &str,
    status: ReviewJobStatus,
    thread_id: Option<&str>,
    error: Option<&str>,
) -> Result<ReviewJob, String> {
    let conn = open()?;
    let now = now_ms();
    let started_at_expr = if status == ReviewJobStatus::Running {
        "COALESCE(started_at, ?4)"
    } else {
        "started_at"
    };
    let finished_at_expr = if matches!(
        status,
        ReviewJobStatus::Succeeded | ReviewJobStatus::Failed | ReviewJobStatus::Cancelled
    ) {
        "?4"
    } else {
        "finished_at"
    };
    let sql = format!(
        r#"
        UPDATE ai_review_jobs
        SET status = ?1,
            thread_id = COALESCE(?2, thread_id),
            error = ?3,
            started_at = {started_at_expr},
            finished_at = {finished_at_expr}
        WHERE id = ?5
        "#
    );
    conn.execute(&sql, params![status.as_str(), thread_id, error, now, id])
        .map_err(|e| e.to_string())?;
    get_review_job(id)?.ok_or_else(|| format!("Unknown review job: {id}"))
}

pub fn get_review_job(id: &str) -> Result<Option<ReviewJob>, String> {
    let conn = open()?;
    conn.query_row(
        r#"
        SELECT id, workspace, repo, pr_id, pr_title, source_branch, destination_branch,
          status, trigger, thread_id, error, created_at, started_at, finished_at
        FROM ai_review_jobs
        WHERE id = ?1
        "#,
        params![id],
        row_to_review_job,
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn list_recent_review_jobs(limit: u32) -> Result<Vec<ReviewJob>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, workspace, repo, pr_id, pr_title, source_branch, destination_branch,
              status, trigger, thread_id, error, created_at, started_at, finished_at
            FROM ai_review_jobs
            ORDER BY CAST(created_at AS INTEGER) DESC
            LIMIT ?1
            "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![i64::from(limit)], row_to_review_job)
        .map_err(|e| e.to_string())?;
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(row.map_err(|e| e.to_string())?);
    }
    let existing_thread_ids: HashSet<String> = jobs
        .iter()
        .filter_map(|job| job.thread_id.clone())
        .collect();
    let mut store_stmt = conn
        .prepare(
            r#"
            SELECT review_key, workspace, repo, pr_id, store_json, created_at, updated_at
            FROM ai_review_stores
            ORDER BY CAST(updated_at AS INTEGER) DESC
            LIMIT ?1
            "#,
        )
        .map_err(|e| e.to_string())?;
    let store_rows = store_stmt
        .query_map(params![i64::from(limit)], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? as u32,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in store_rows {
        let (review_key, workspace, repo, pr_id, store_json, created_at, updated_at) =
            row.map_err(|e| e.to_string())?;
        let Ok(store) = serde_json::from_str::<StoredReviewStore>(&store_json) else {
            continue;
        };
        let StoredReviewStore {
            threads,
            review_runs,
        } = store;
        for thread in threads {
            if existing_thread_ids.contains(&thread.id) {
                continue;
            }
            let run = review_runs
                .iter()
                .rev()
                .find(|run| run.thread_id.as_deref() == Some(thread.id.as_str()));
            let status = run
                .map(|run| review_job_status_from_run(&run.status))
                .unwrap_or_else(|| {
                    if thread
                        .messages
                        .iter()
                        .any(|message| message.role == "assistant")
                    {
                        ReviewJobStatus::Succeeded
                    } else {
                        ReviewJobStatus::Failed
                    }
                });
            let terminal = matches!(
                status,
                ReviewJobStatus::Succeeded | ReviewJobStatus::Failed | ReviewJobStatus::Cancelled
            );
            let (source_branch, destination_branch) = run
                .map(|run| (run.source_branch.clone(), run.destination_branch.clone()))
                .unwrap_or_else(|| (String::new(), String::new()));
            jobs.push(ReviewJob {
                id: format!("store:{review_key}:{}", thread.id),
                workspace: workspace.clone(),
                repo: repo.clone(),
                pr_id,
                pr_title: if thread.title.trim().is_empty() {
                    format!("PR #{pr_id}")
                } else {
                    thread.title.clone()
                },
                source_branch,
                destination_branch,
                status,
                trigger: "manual".to_string(),
                thread_id: Some(thread.id),
                error: if status == ReviewJobStatus::Failed {
                    Some("Review thread has no assistant response captured.".to_string())
                } else {
                    None
                },
                created_at: run.map(|run| run.created_at.clone()).unwrap_or_else(|| {
                    if thread.created_at.is_empty() {
                        created_at.clone()
                    } else {
                        thread.created_at.clone()
                    }
                }),
                started_at: Some(created_at.clone()),
                finished_at: if terminal {
                    run.and_then(|run| run.finished_at.clone())
                        .or(Some(updated_at.clone()))
                } else {
                    None
                },
            });
        }
    }
    jobs.sort_by(|a, b| {
        parse_ms(&b.created_at)
            .cmp(&parse_ms(&a.created_at))
            .then_with(|| b.id.cmp(&a.id))
    });
    jobs.truncate(limit as usize);
    Ok(jobs)
}

fn review_job_status_from_run(status: &str) -> ReviewJobStatus {
    match status {
        "succeeded" => ReviewJobStatus::Succeeded,
        "failed" => ReviewJobStatus::Failed,
        "cancelled" => ReviewJobStatus::Cancelled,
        "queued" => ReviewJobStatus::Queued,
        _ => ReviewJobStatus::Running,
    }
}

fn parse_ms(value: &str) -> u128 {
    value.parse::<u128>().unwrap_or(0)
}

fn row_to_review_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewJob> {
    let status: String = row.get(7)?;
    Ok(ReviewJob {
        id: row.get(0)?,
        workspace: row.get(1)?,
        repo: row.get(2)?,
        pr_id: row.get::<_, i64>(3)? as u32,
        pr_title: row.get(4)?,
        source_branch: row.get(5)?,
        destination_branch: row.get(6)?,
        status: ReviewJobStatus::from_str(&status),
        trigger: row.get(8)?,
        thread_id: row.get(9)?,
        error: row.get(10)?,
        created_at: row.get(11)?,
        started_at: row.get(12)?,
        finished_at: row.get(13)?,
    })
}

fn cleanup_legacy_review_files(keep_keys: &[String]) -> Result<(), String> {
    let dir = legacy_reviews_dir()?;
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if !keep_keys.contains(&stem) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub fn database_path_for_diagnostics() -> Result<PathBuf, String> {
    db_path()
}

#[allow(dead_code)]
fn _assert_path_send_sync(_: &Path) {}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn test_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("lachesi-{name}-{nanos}"))
    }

    fn with_test_data_dir<T>(name: &str, f: impl FnOnce(&Path) -> T) -> T {
        let _guard = ENV_LOCK.lock().expect("test env lock");
        let dir = test_dir(name);
        std::env::set_var("LACHESI_DATA_DIR", &dir);
        let result = f(&dir);
        std::env::remove_var("LACHESI_DATA_DIR");
        let _ = fs::remove_dir_all(&dir);
        result
    }

    #[test]
    fn saves_and_loads_review_json_from_sqlite() {
        with_test_data_dir("roundtrip", |dir| {
            save_review_json("workspace", "repo", 123, r#"{"threads":[]}"#).expect("save review");

            assert!(dir.join(DB_FILE).exists());
            let loaded = load_review_json("workspace", "repo", 123).expect("load review");
            assert_eq!(loaded.as_deref(), Some(r#"{"threads":[]}"#));
        });
    }

    #[test]
    fn migrates_legacy_json_on_first_load() {
        with_test_data_dir("migration", |dir| {
            let legacy_dir = dir.join(LEGACY_REVIEWS_DIR);
            fs::create_dir_all(&legacy_dir).expect("legacy dir");
            fs::write(
                legacy_dir.join(legacy_review_file_name("workspace", "repo", 456)),
                r#"{"content":"old review","generatedAt":"1"}"#,
            )
            .expect("legacy review file");

            let loaded = load_review_json("workspace", "repo", 456).expect("load review");
            assert_eq!(
                loaded.as_deref(),
                Some(r#"{"content":"old review","generatedAt":"1"}"#)
            );
            assert!(dir.join(DB_FILE).exists());
        });
    }

    #[test]
    fn cleanup_removes_stale_db_rows_and_legacy_files() {
        with_test_data_dir("cleanup", |dir| {
            save_review_json("workspace", "repo", 1, r#"{"one":true}"#).expect("save one");
            save_review_json("workspace", "repo", 2, r#"{"two":true}"#).expect("save two");
            let legacy_dir = dir.join(LEGACY_REVIEWS_DIR);
            fs::create_dir_all(&legacy_dir).expect("legacy dir");
            let stale_legacy = legacy_dir.join(legacy_review_file_name("workspace", "repo", 2));
            fs::write(&stale_legacy, "{}").expect("legacy review file");

            cleanup_stale_reviews(&["workspace_repo_1".to_string()]).expect("cleanup");

            assert!(load_review_json("workspace", "repo", 1)
                .expect("load kept")
                .is_some());
            assert!(load_review_json("workspace", "repo", 2)
                .expect("load removed")
                .is_none());
            assert!(!stale_legacy.exists());
        });
    }

    #[test]
    fn tracks_review_job_lifecycle() {
        with_test_data_dir("jobs", |_| {
            let job = create_review_job(
                "workspace",
                "repo",
                9,
                "Add menu review",
                "feature/menu-review",
                "main",
                "menuBar",
            )
            .expect("create job");
            assert_eq!(job.status, ReviewJobStatus::Queued);

            let running =
                update_review_job_status(&job.id, ReviewJobStatus::Running, Some("thread-1"), None)
                    .expect("mark running");
            assert_eq!(running.status, ReviewJobStatus::Running);
            assert_eq!(running.thread_id.as_deref(), Some("thread-1"));
            assert!(running.started_at.is_some());

            let finished = update_review_job_status(
                &job.id,
                ReviewJobStatus::Succeeded,
                Some("thread-1"),
                None,
            )
            .expect("mark succeeded");
            assert_eq!(finished.status, ReviewJobStatus::Succeeded);
            assert!(finished.finished_at.is_some());

            let jobs = list_recent_review_jobs(10).expect("list jobs");
            assert_eq!(jobs.len(), 1);
            assert_eq!(jobs[0].id, job.id);
        });
    }

    #[test]
    fn lists_saved_review_threads_as_synthetic_history_jobs() {
        with_test_data_dir("synthetic-history", |_| {
            save_review_json(
                "workspace",
                "repo",
                42,
                r#"{
                  "activeThreadId": "thread-1",
                  "threads": [{
                    "id": "thread-1",
                    "title": "Review",
                    "createdAt": "1000",
                    "updatedAt": "2000",
                    "claudeSessionId": "session-1",
                    "messages": [{
                      "id": "msg-1",
                      "role": "assistant",
                      "content": "Looks good",
                      "createdAt": "2000"
                    }]
                  }],
                  "reviewRuns": []
                }"#,
            )
            .expect("save review store");

            let jobs = list_recent_review_jobs(10).expect("list jobs");

            assert_eq!(jobs.len(), 1);
            assert_eq!(jobs[0].workspace, "workspace");
            assert_eq!(jobs[0].repo, "repo");
            assert_eq!(jobs[0].pr_id, 42);
            assert_eq!(jobs[0].status, ReviewJobStatus::Succeeded);
            assert_eq!(jobs[0].trigger, "manual");
            assert_eq!(jobs[0].thread_id.as_deref(), Some("thread-1"));
        });
    }
}
