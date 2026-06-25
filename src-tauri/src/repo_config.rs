use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Deserializer, Serialize};
use serde_yaml::Value;

const CONFIG_FILE: &str = ".lachesi.yaml";
const SUPPORTED_VERSION: &str = "0.1";

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepoReviewConfig {
    #[serde(deserialize_with = "deserialize_version")]
    pub version: String,
    #[serde(default)]
    pub review: Option<ReviewConfig>,
    #[serde(default)]
    pub paths: Option<PathFilters>,
    #[serde(default)]
    pub policy: Option<PolicyConfig>,
    #[serde(default)]
    pub analyzers: BTreeMap<String, AnalyzerConfig>,
    #[serde(default)]
    pub publish: Option<PublishConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewConfig {
    #[serde(default)]
    pub mode: Option<ReviewMode>,
    #[serde(default)]
    pub prompt: Option<PromptConfig>,
    #[serde(default)]
    pub findings: Option<FindingConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewMode {
    Fast,
    #[default]
    Balanced,
    Strict,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptConfig {
    #[serde(default)]
    pub extend: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FindingConfig {
    #[serde(default)]
    pub min_severity: Option<ReviewSeverity>,
    #[serde(default)]
    pub require_anchors: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewSeverity {
    Info,
    #[default]
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathFilters {
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PolicyConfig {
    #[serde(default)]
    pub sources: Vec<PolicySource>,
    #[serde(default)]
    pub rules: Vec<PolicyRule>,
    #[serde(default)]
    pub path_rules: Vec<PathRule>,
    #[serde(default)]
    pub ast_rules: Vec<AstRule>,
    #[serde(default)]
    pub suppressions: Vec<PolicySuppression>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolicySource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRule {
    pub id: String,
    #[serde(default)]
    pub source: Option<String>,
    pub severity: ReviewSeverity,
    #[serde(default)]
    pub confidence: Option<ReviewConfidence>,
    #[serde(default)]
    pub applies_to: Option<PathFilters>,
    pub instruction: String,
    #[serde(default)]
    pub rationale: Option<String>,
    #[serde(default)]
    pub remediation: Option<String>,
    #[serde(default)]
    pub enforcement: Option<PolicyEnforcement>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewConfidence {
    Low,
    #[default]
    Medium,
    High,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PolicyEnforcement {
    #[default]
    Prompt,
    Analyzer,
    Ast,
    Manual,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathRule {
    pub id: String,
    pub severity: ReviewSeverity,
    pub paths: PathFilters,
    pub instruction: String,
    #[serde(default)]
    pub rationale: Option<String>,
    #[serde(default)]
    pub remediation: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AstRule {
    pub id: String,
    pub language: String,
    pub severity: ReviewSeverity,
    #[serde(default)]
    pub selector: BTreeMap<String, Value>,
    #[serde(default)]
    pub applies_to: Option<PathFilters>,
    pub instruction: String,
    #[serde(default)]
    pub rationale: Option<String>,
    #[serde(default)]
    pub remediation: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolicySuppression {
    pub rule_id: String,
    pub paths: PathFilters,
    pub reason: String,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub timeout_seconds: Option<u64>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub config: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewPublicationMode {
    #[default]
    Inline,
    File,
    General,
    LocalOnly,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishConfig {
    #[serde(default)]
    pub default_mode: Option<ReviewPublicationMode>,
    #[serde(default)]
    pub require_manual_submit: Option<bool>,
    #[serde(default)]
    pub allow_general_comments: Option<bool>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoConfigValidationMessage {
    pub path: String,
    pub message: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepoReviewConfigLoadResult {
    pub repo_path: String,
    pub config_path: String,
    pub exists: bool,
    pub config: Option<RepoReviewConfig>,
    pub warnings: Vec<RepoConfigValidationMessage>,
    pub errors: Vec<RepoConfigValidationMessage>,
}

fn deserialize_version<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::String(value) => Ok(value),
        Value::Number(value) => Ok(value.to_string()),
        _ => Err(serde::de::Error::custom("version must be a string or number")),
    }
}

pub fn load_from_repo_path(repo_path: &Path) -> Result<RepoReviewConfigLoadResult, String> {
    if !repo_path.is_dir() {
        return Err(format!(
            "Repository path does not exist or is not a directory: {}",
            repo_path.display()
        ));
    }

    let config_path = repo_path.join(CONFIG_FILE);
    if !config_path.exists() {
        return Ok(RepoReviewConfigLoadResult {
            repo_path: repo_path.display().to_string(),
            config_path: config_path.display().to_string(),
            exists: false,
            config: None,
            warnings: Vec::new(),
            errors: Vec::new(),
        });
    }

    let contents = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read {}: {e}", config_path.display()))?;
    Ok(load_from_str(repo_path, &config_path, &contents))
}

fn load_from_str(repo_path: &Path, config_path: &Path, contents: &str) -> RepoReviewConfigLoadResult {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    let value = match serde_yaml::from_str::<Value>(contents) {
        Ok(value) => value,
        Err(error) => {
            errors.push(message(
                config_path,
                format!("Failed to parse YAML: {error}"),
            ));
            return result(repo_path, config_path, true, None, warnings, errors);
        }
    };

    warnings.extend(unknown_field_warnings(config_path, &value));
    errors.extend(forbidden_field_errors(config_path, &value));

    let config = match serde_yaml::from_value::<RepoReviewConfig>(value) {
        Ok(config) => {
            validate_config(config_path, &config, &mut errors);
            Some(config)
        }
        Err(error) => {
            errors.push(message(
                config_path,
                format!("Invalid repo config shape: {error}"),
            ));
            None
        }
    };

    result(repo_path, config_path, true, config, warnings, errors)
}

fn validate_config(
    config_path: &Path,
    config: &RepoReviewConfig,
    errors: &mut Vec<RepoConfigValidationMessage>,
) {
    if config.version.trim().is_empty() {
        errors.push(message(config_path, "version is required"));
    } else if config.version != SUPPORTED_VERSION {
        errors.push(message(
            config_path,
            format!(
                "Unsupported .lachesi.yaml version {}. Supported version is {SUPPORTED_VERSION}.",
                config.version
            ),
        ));
    }

    for (id, analyzer) in &config.analyzers {
        if analyzer.enabled && analyzer.command.as_deref().unwrap_or("").trim().is_empty() {
            errors.push(message(
                config_path,
                format!("Analyzer `{id}` is enabled but has no command."),
            ));
        }
    }
}

fn result(
    repo_path: &Path,
    config_path: &Path,
    exists: bool,
    config: Option<RepoReviewConfig>,
    warnings: Vec<RepoConfigValidationMessage>,
    errors: Vec<RepoConfigValidationMessage>,
) -> RepoReviewConfigLoadResult {
    RepoReviewConfigLoadResult {
        repo_path: repo_path.display().to_string(),
        config_path: config_path.display().to_string(),
        exists,
        config,
        warnings,
        errors,
    }
}

fn message(path: &Path, message: impl Into<String>) -> RepoConfigValidationMessage {
    RepoConfigValidationMessage {
        path: path.display().to_string(),
        message: message.into(),
    }
}

fn unknown_field_warnings(config_path: &Path, value: &Value) -> Vec<RepoConfigValidationMessage> {
    let mut warnings = Vec::new();
    collect_unknown_fields(config_path, value, "$", None, &mut warnings);
    warnings
}

fn collect_unknown_fields(
    config_path: &Path,
    value: &Value,
    path: &str,
    context: Option<&str>,
    warnings: &mut Vec<RepoConfigValidationMessage>,
) {
    let Value::Mapping(mapping) = value else {
        return;
    };

    for (key, child) in mapping {
        let Some(key) = key.as_str() else {
            continue;
        };
        let child_path = format!("{path}.{key}");
        if let Some(known) = known_keys(context, key) {
            if !known.contains(&key) && !key.starts_with("x-") {
                warnings.push(message(
                    config_path,
                    format!("Unknown repo config field `{child_path}`."),
                ));
            }
        }

        let next_context = next_context(context, key);
        if next_context == Some("analyzerMap") {
            collect_analyzer_fields(config_path, child, &child_path, warnings);
        } else {
            collect_unknown_fields(config_path, child, &child_path, next_context, warnings);
        }
    }
}

fn collect_analyzer_fields(
    config_path: &Path,
    value: &Value,
    path: &str,
    warnings: &mut Vec<RepoConfigValidationMessage>,
) {
    let Value::Mapping(mapping) = value else {
        return;
    };
    for (key, child) in mapping {
        let Some(analyzer_id) = key.as_str() else {
            continue;
        };
        let analyzer_path = format!("{path}.{analyzer_id}");
        collect_unknown_fields(
            config_path,
            child,
            &analyzer_path,
            Some("analyzer"),
            warnings,
        );
    }
}

fn known_keys(context: Option<&str>, key: &str) -> Option<&'static [&'static str]> {
    match context {
        None => Some(&["version", "review", "paths", "policy", "analyzers", "publish"]),
        Some("review") => Some(&["mode", "prompt", "findings"]),
        Some("prompt") => Some(&["extend"]),
        Some("findings") => Some(&["minSeverity", "requireAnchors"]),
        Some("paths") | Some("appliesTo") => Some(&["include", "exclude"]),
        Some("policy") => Some(&["sources", "rules", "pathRules", "astRules", "suppressions"]),
        Some("policySource") => Some(&["type", "path"]),
        Some("rule") => Some(&[
            "id",
            "source",
            "severity",
            "confidence",
            "appliesTo",
            "instruction",
            "rationale",
            "remediation",
            "enforcement",
        ]),
        Some("pathRule") => Some(&["id", "severity", "paths", "instruction", "rationale", "remediation"]),
        Some("astRule") => Some(&[
            "id",
            "language",
            "severity",
            "selector",
            "appliesTo",
            "instruction",
            "rationale",
            "remediation",
        ]),
        Some("selector") => Some(&["kind", "callee", "argumentContains"]),
        Some("suppression") => Some(&["ruleId", "paths", "reason", "expiresAt"]),
        Some("analyzer") => Some(&["enabled", "command", "timeoutSeconds", "required", "config"]),
        Some("publish") => Some(&["defaultMode", "requireManualSubmit", "allowGeneralComments"]),
        Some("analyzerMap") => {
            let _ = key;
            None
        }
        _ => None,
    }
}

fn next_context(context: Option<&str>, key: &str) -> Option<&'static str> {
    match (context, key) {
        (None, "review") => Some("review"),
        (None, "paths") => Some("paths"),
        (None, "policy") => Some("policy"),
        (None, "analyzers") => Some("analyzerMap"),
        (None, "publish") => Some("publish"),
        (Some("review"), "prompt") => Some("prompt"),
        (Some("review"), "findings") => Some("findings"),
        (Some("policy"), "sources") => Some("policySource"),
        (Some("policy"), "rules") => Some("rule"),
        (Some("policy"), "pathRules") => Some("pathRule"),
        (Some("policy"), "astRules") => Some("astRule"),
        (Some("policy"), "suppressions") => Some("suppression"),
        (Some("rule"), "appliesTo") | (Some("astRule"), "appliesTo") => Some("appliesTo"),
        (Some("pathRule"), "paths") | (Some("suppression"), "paths") => Some("paths"),
        (Some("astRule"), "selector") => Some("selector"),
        _ => None,
    }
}

fn forbidden_field_errors(config_path: &Path, value: &Value) -> Vec<RepoConfigValidationMessage> {
    let mut errors = Vec::new();
    collect_forbidden_fields(config_path, value, "$", &mut errors);
    errors
}

fn collect_forbidden_fields(
    config_path: &Path,
    value: &Value,
    path: &str,
    errors: &mut Vec<RepoConfigValidationMessage>,
) {
    match value {
        Value::Mapping(mapping) => {
            for (key, child) in mapping {
                let Some(key) = key.as_str() else {
                    continue;
                };
                let child_path = format!("{path}.{key}");
                let normalized = key
                    .chars()
                    .filter(|ch| ch.is_ascii_alphanumeric())
                    .collect::<String>()
                    .to_ascii_lowercase();
                if matches!(
                    normalized.as_str(),
                    "credential" | "credentials" | "token" | "apitoken" | "password" | "secret" | "username"
                ) {
                    errors.push(message(
                        config_path,
                        format!(
                            "Repo config field `{child_path}` looks like a credential. Store secrets in the keychain or environment instead."
                        ),
                    ));
                }
                collect_forbidden_fields(config_path, child, &child_path, errors);
            }
        }
        Value::Sequence(items) => {
            for (index, child) in items.iter().enumerate() {
                collect_forbidden_fields(config_path, child, &format!("{path}[{index}]"), errors);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::{load_from_repo_path, load_from_str};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("lachesi-repo-config-test-{nonce}"));
        fs::create_dir_all(&path).expect("create temp repo");
        path
    }

    #[test]
    fn missing_config_is_valid_empty_result() {
        let repo = temp_repo();
        let result = load_from_repo_path(&repo).expect("load result");
        assert!(!result.exists);
        assert!(result.config.is_none());
        assert!(result.warnings.is_empty());
        assert!(result.errors.is_empty());
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn parses_valid_minimal_config() {
        let repo = temp_repo();
        let path = repo.join(".lachesi.yaml");
        fs::write(
            &path,
            r#"
version: 0.1
review:
  mode: balanced
publish:
  requireManualSubmit: true
"#,
        )
        .expect("write config");

        let result = load_from_repo_path(&repo).expect("load result");
        assert!(result.exists);
        assert!(result.errors.is_empty());
        assert_eq!(result.config.as_ref().map(|config| config.version.as_str()), Some("0.1"));
        let _ = fs::remove_dir_all(repo);
    }

    #[test]
    fn unknown_fields_warn_without_blocking() {
        let repo = temp_repo();
        let result = load_from_str(
            &repo,
            &repo.join(".lachesi.yaml"),
            r#"
version: 0.1
x-experiment: true
review:
  mode: fast
  surprise: true
"#,
        );

        assert!(result.errors.is_empty());
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].message.contains("$.review.surprise"));
    }

    #[test]
    fn unsupported_version_is_blocking_error() {
        let repo = temp_repo();
        let result = load_from_str(
            &repo,
            &repo.join(".lachesi.yaml"),
            r#"
version: 2.0
"#,
        );

        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("Unsupported .lachesi.yaml version"));
    }

    #[test]
    fn credential_fields_are_blocking_errors() {
        let repo = temp_repo();
        let result = load_from_str(
            &repo,
            &repo.join(".lachesi.yaml"),
            r#"
version: 0.1
token: abc123
"#,
        );

        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("looks like a credential"));
    }

    #[test]
    fn enabled_analyzer_requires_command() {
        let repo = temp_repo();
        let result = load_from_str(
            &repo,
            &repo.join(".lachesi.yaml"),
            r#"
version: 0.1
analyzers:
  tsc:
    enabled: true
"#,
        );

        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("Analyzer `tsc` is enabled but has no command"));
    }
}
