mod commands;
mod config;
mod credentials;
mod launch;
mod local_repo;
mod repo_config;
mod review_storage;

use commands::{bitbucket, context, repositories, review};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

const TRAY_ID: &str = "lachesi-main";

fn setup_menu_bar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open Lachesi", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync pull requests", true, None::<&str>)?;
    let loading = MenuItem::with_id(
        app,
        "latest-heading",
        "Loading pull requests...",
        false,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open, &sync, &loading])?;
    let icon = app.default_window_icon().cloned();
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Lachesi")
        .icon_as_template(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                let _ = app.emit("lachesi-menu-open", ());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "sync" => {
                let _ = app.emit("lachesi-menu-sync", ());
            }
            id if id.starts_with("pr-") => {
                let _ = app.emit("lachesi-menu-open-pr", id.trim_start_matches("pr-"));
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = app.emit("lachesi-menu-open", ());
            }
        });
    if let Some(icon) = icon {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(review::AiReviewRunStore::default())
        .manage(review::AiReviewFixStore::default())
        .setup(|app| {
            setup_menu_bar(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bitbucket::load_config,
            bitbucket::validate_repo_review_config,
            bitbucket::save_config,
            bitbucket::save_credentials,
            bitbucket::has_credentials,
            bitbucket::clear_credentials,
            bitbucket::save_jira_token,
            bitbucket::save_notion_token,
            bitbucket::test_connection,
            bitbucket::get_current_user,
            bitbucket::list_pull_requests,
            bitbucket::get_pull_request,
            bitbucket::approve_pull_request,
            bitbucket::get_branch_status,
            bitbucket::get_diffstat,
            bitbucket::get_pr_diff,
            bitbucket::list_comments,
            bitbucket::create_inline_comment,
            bitbucket::create_general_comment,
            bitbucket::delete_comment,
            launch::list_review_terminals,
            launch::launch_claude_review,
            context::get_jira_issue,
            context::get_notion_page,
            repositories::list_repository_worktrees,
            repositories::list_repository_files,
            repositories::read_repository_file,
            repositories::checkout_repository_branch,
            repositories::fetch_repository,
            repositories::pull_repository,
            review::get_ai_review_run_state,
            review::load_ai_review_store,
            review::create_ai_review_thread,
            review::set_active_ai_review_thread,
            review::delete_ai_review_thread,
            review::record_ai_review_finding_publication,
            review::start_inline_review,
            review::reply_inline_review,
            review::cancel_inline_review,
            review::run_inline_review,
            review::draft_ai_review_comments,
            review::create_ai_review_job,
            review::update_ai_review_job_status,
            review::list_ai_review_jobs,
            review::load_saved_review,
            review::delete_saved_review,
            review::cleanup_stale_reviews,
            review::get_ai_review_fix_state,
            review::start_ai_review_fix,
            review::start_ai_review_commit,
            review::start_ai_review_push,
            review::start_ai_conflict_resolution,
            review::sync_pr_branch,
            review::reset_ai_review_fix_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
