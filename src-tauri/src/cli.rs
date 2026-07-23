use std::io::{self, Write};
use std::path::PathBuf;

use serde::Serialize;

use crate::repo_config::{self, LoadedPolicyPack, RepoConfigValidationMessage};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputFormat {
    Human,
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ConfigValidateArgs {
    repo_path: PathBuf,
    profile: Option<String>,
    format: OutputFormat,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigValidateOutput {
    valid: bool,
    repo_path: String,
    config_path: String,
    exists: bool,
    selected_profile: Option<String>,
    prompt_replaces_default: bool,
    loaded_policy_packs: Vec<LoadedPolicyPack>,
    warnings: Vec<RepoConfigValidationMessage>,
    errors: Vec<RepoConfigValidationMessage>,
}

pub fn run_from_env_if_cli() -> Option<i32> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if !is_cli_command(&args) {
        return None;
    }

    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    Some(run_args(&args, &mut stdout, &mut stderr))
}

fn is_cli_command(args: &[String]) -> bool {
    matches!(
        args.first().map(String::as_str),
        Some("config" | "--help" | "-h")
    )
}

fn run_args(args: &[String], stdout: &mut dyn Write, stderr: &mut dyn Write) -> i32 {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        let _ = writeln!(stdout, "{}", usage());
        return 0;
    }

    match parse_config_validate_args(args) {
        Ok(args) => run_config_validate(args, stdout, stderr),
        Err(error) => {
            let _ = writeln!(stderr, "{error}\n\n{}", usage());
            1
        }
    }
}

fn parse_config_validate_args(args: &[String]) -> Result<ConfigValidateArgs, String> {
    if args.first().map(String::as_str) != Some("config")
        || args.get(1).map(String::as_str) != Some("validate")
    {
        return Err("Expected `lachesi config validate`.".to_string());
    }

    let mut repo_path = PathBuf::from(".");
    let mut profile = None;
    let mut format = OutputFormat::Human;
    let mut index = 2;
    while index < args.len() {
        match args[index].as_str() {
            "--repo-path" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "`--repo-path` requires a value.".to_string())?;
                repo_path = PathBuf::from(value);
            }
            "--profile" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "`--profile` requires a value.".to_string())?;
                profile = Some(value.to_string());
            }
            "--format" => {
                index += 1;
                let value = args
                    .get(index)
                    .ok_or_else(|| "`--format` requires a value.".to_string())?;
                format = match value.as_str() {
                    "human" | "text" => OutputFormat::Human,
                    "json" => OutputFormat::Json,
                    _ => return Err("`--format` must be `human` or `json`.".to_string()),
                };
            }
            "--json" => {
                format = OutputFormat::Json;
            }
            unknown => return Err(format!("Unknown option `{unknown}`.")),
        }
        index += 1;
    }

    Ok(ConfigValidateArgs {
        repo_path,
        profile,
        format,
    })
}

fn run_config_validate(
    args: ConfigValidateArgs,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> i32 {
    let result = match repo_config::load_from_repo_path_with_profile(
        &args.repo_path,
        args.profile.as_deref(),
    ) {
        Ok(result) => result,
        Err(error) => {
            let _ = writeln!(stderr, "{error}");
            return 1;
        }
    };
    let valid = result.errors.is_empty();
    let output = ConfigValidateOutput {
        valid,
        repo_path: result.repo_path,
        config_path: result.config_path,
        exists: result.exists,
        selected_profile: result.selected_profile,
        prompt_replaces_default: result
            .config
            .as_ref()
            .and_then(|config| config.review.as_ref())
            .and_then(|review| review.prompt.as_ref())
            .and_then(|prompt| prompt.replace.as_deref())
            .map(str::trim)
            .is_some_and(|prompt| !prompt.is_empty()),
        loaded_policy_packs: result.loaded_policy_packs,
        warnings: result.warnings,
        errors: result.errors,
    };

    match args.format {
        OutputFormat::Human => {
            let _ = write_human_output(&output, stdout);
        }
        OutputFormat::Json => match serde_json::to_string_pretty(&output) {
            Ok(json) => {
                let _ = writeln!(stdout, "{json}");
            }
            Err(error) => {
                let _ = writeln!(stderr, "Failed to serialize validation output: {error}");
                return 1;
            }
        },
    }

    if valid {
        0
    } else {
        2
    }
}

fn write_human_output(output: &ConfigValidateOutput, out: &mut dyn Write) -> io::Result<()> {
    if output.valid {
        writeln!(out, "Lachesi config valid")?;
    } else {
        writeln!(out, "Lachesi config invalid")?;
    }
    writeln!(out, "Repo: {}", output.repo_path)?;
    writeln!(out, "Config: {}", output.config_path)?;
    if !output.exists {
        writeln!(out, "No .lachesi.yaml found; using built-in defaults.")?;
    }
    if let Some(profile) = output.selected_profile.as_deref() {
        writeln!(out, "Profile: {profile}")?;
    }
    if output.prompt_replaces_default {
        writeln!(out, "Prompt: replaces built-in default")?;
    }
    if !output.loaded_policy_packs.is_empty() {
        writeln!(out, "Loaded policy packs:")?;
        for pack in &output.loaded_policy_packs {
            writeln!(out, "- {} ({})", pack.id, pack.path)?;
        }
    }
    if !output.warnings.is_empty() {
        writeln!(out, "Warnings:")?;
        for warning in &output.warnings {
            writeln!(out, "- {}: {}", warning.path, warning.message)?;
        }
    }
    if !output.errors.is_empty() {
        writeln!(out, "Errors:")?;
        for error in &output.errors {
            writeln!(out, "- {}: {}", error.path, error.message)?;
        }
    }
    Ok(())
}

fn usage() -> &'static str {
    "Usage: lachesi config validate [--repo-path <path>] [--profile <name>] [--format human|json] [--json]"
}

#[cfg(test)]
mod tests {
    use super::run_args;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_REPO_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_repo() -> PathBuf {
        let nonce = TEMP_REPO_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "lachesi-cli-config-test-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp repo");
        path
    }

    #[test]
    fn config_validate_returns_zero_for_valid_config() {
        let repo = temp_repo();
        fs::write(repo.join(".lachesi.yaml"), "version: 0.1\n").expect("write config");
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let code = run_args(
            &[
                "config".to_string(),
                "validate".to_string(),
                "--repo-path".to_string(),
                repo.display().to_string(),
            ],
            &mut stdout,
            &mut stderr,
        );

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(String::from_utf8(stdout)
            .expect("stdout")
            .contains("Lachesi config valid"));
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn config_validate_returns_two_for_invalid_config_json() {
        let repo = temp_repo();
        fs::write(
            repo.join(".lachesi.yaml"),
            r#"
version: 0.1
token: unsafe
"#,
        )
        .expect("write config");
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let code = run_args(
            &[
                "config".to_string(),
                "validate".to_string(),
                "--repo-path".to_string(),
                repo.display().to_string(),
                "--json".to_string(),
            ],
            &mut stdout,
            &mut stderr,
        );

        assert_eq!(code, 2);
        assert!(stderr.is_empty());
        let output = String::from_utf8(stdout).expect("stdout");
        assert!(output.contains("\"valid\": false"));
        assert!(output.contains("looks like a credential"));
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn config_validate_accepts_profile_override() {
        let repo = temp_repo();
        fs::write(
            repo.join(".lachesi.yaml"),
            r#"
version: 0.1
profiles:
  strict:
    mode: strict
"#,
        )
        .expect("write config");
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let code = run_args(
            &[
                "config".to_string(),
                "validate".to_string(),
                "--repo-path".to_string(),
                repo.display().to_string(),
                "--profile".to_string(),
                "strict".to_string(),
            ],
            &mut stdout,
            &mut stderr,
        );

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(String::from_utf8(stdout)
            .expect("stdout")
            .contains("Profile: strict"));
        let _ = fs::remove_dir_all(repo);
    }
}
