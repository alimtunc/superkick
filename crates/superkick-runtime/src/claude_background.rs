//! Claude background-session CLI controller (`claude --bg`).
//!
//! A thin, testable wrapper over the four `claude` background commands Superkick
//! drives for the subscription autonomous runner:
//!
//! - launch: `claude --bg --name <name> [--effort <level>] "<prompt>"` from the worktree `cwd`
//!   (never `--cwd`, which the spike observed launching a session that
//!   immediately `failed`).
//! - poll:   `claude agents --json --all`, filtered by the persisted background
//!   id first, then defensively by `kind == "background"` + Superkick name +
//!   expected `cwd`.
//! - logs:   `claude logs <id>` — best-effort terminal scrollback (NOT JSON, NOT
//!   structured events). Fragile after daemon idle/restart, so read failure is
//!   tolerated, never fatal.
//! - stop:   `claude stop <id>` — cancel; keeps the conversation resumable.
//!
//! Billing: `--bg` is believed to run on the operator's Claude subscription
//! (local evidence, not externally proven) — which is *why* the launch scrubs
//! the API/billing override env (`BILLING_OVERRIDE_ENV`), so a stray
//! `ANTHROPIC_API_KEY` can't silently force pay-as-you-go. Normal Claude
//! config/auth is left untouched.

use std::collections::HashSet;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{Context, Result};
use serde::Deserialize;
use tokio::process::Command;
use tracing::warn;

/// API/billing override env removed from the `claude --bg` child so the
/// subscription path can't be silently redirected to pay-as-you-go or a custom
/// endpoint. Auth/config env (e.g. `CLAUDE_CONFIG_DIR`) is intentionally left
/// alone — the runner uses the operator's normal Claude login.
pub const BILLING_OVERRIDE_ENV: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
];

/// Coarse background-session state from `claude agents --json`. The JSON carries
/// no `waitingFor`/reason/error field, so state is all we get; `Unknown` keeps
/// an unrecognised string rather than guessing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackgroundState {
    Working,
    Blocked,
    Done,
    Failed,
    Stopped,
    Unknown(String),
}

impl BackgroundState {
    /// Parse the bare `state` string. Case-insensitive; unknown values are
    /// preserved so the driver can log them and keep polling.
    pub fn from_state_str(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "working" => Self::Working,
            "blocked" => Self::Blocked,
            "done" => Self::Done,
            "failed" => Self::Failed,
            "stopped" => Self::Stopped,
            other => Self::Unknown(other.to_string()),
        }
    }

    /// Whether the driver should stop polling and finalise the step.
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Done | Self::Failed | Self::Stopped)
    }
}

/// One background agent as Superkick cares about it (subset of the `claude
/// agents --json` row).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackgroundAgent {
    pub id: String,
    pub session_id: Option<String>,
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub state: BackgroundState,
}

/// Parameters for launching a background session.
#[derive(Debug, Clone)]
pub struct BackgroundLaunch {
    pub name: String,
    pub prompt: String,
    pub cwd: PathBuf,
    /// Resolved `--effort <value>` for the session. `None` lets the CLI pick its
    /// own default; `Some` forwards the operator's per-step reasoning effort.
    pub effort: Option<String>,
}

/// Result of launching: the control handle id and (when known) the longer
/// session id.
#[derive(Debug, Clone)]
pub struct BackgroundHandle {
    pub id: String,
    pub session_id: Option<String>,
}

/// Filter for locating a Superkick-owned background agent in the (mixed)
/// `claude agents` list. `id` is the primary key; `name` + `cwd` are the
/// defensive fallback used before the id is known.
#[derive(Debug, Clone)]
pub struct BackgroundFilter {
    pub id: String,
    pub name: String,
    pub cwd: PathBuf,
}

/// The four background operations Superkick drives. A trait so CI can inject a
/// fake without a real `claude` binary; the futures are `Send` so the driver
/// can be `tokio::spawn`ed generically.
pub trait ClaudeBackgroundCli: Send + Sync + 'static {
    fn launch(
        &self,
        params: BackgroundLaunch,
    ) -> impl Future<Output = Result<BackgroundHandle>> + Send;

    /// Locate the session in `claude agents --json --all`. `Ok(None)` = not in
    /// the list (daemon may have dropped it); the driver tolerates a bounded
    /// number of misses before failing honestly.
    fn poll(
        &self,
        filter: &BackgroundFilter,
    ) -> impl Future<Output = Result<Option<BackgroundAgent>>> + Send;

    /// Best-effort terminal logs. `Ok(None)` when the daemon socket is gone
    /// (ENOENT after idle/restart) or the read otherwise fails — never an error.
    fn logs(&self, id: &str) -> impl Future<Output = Result<Option<String>>> + Send;

    /// Read the durable session transcript JSONL (`<config>/projects/<slug>/<sessionId>.jsonl`)
    /// — the lossless, append-only record of the agent's final message, immune to
    /// the TUI overdraw / scrollback eviction that corrupts `claude logs`. This is
    /// the source of truth for the step-result marker on `done`. `Ok(None)` when
    /// the transcript can't be located (falls back to the scrollback scan).
    fn transcript(&self, session_id: &str) -> impl Future<Output = Result<Option<String>>> + Send;

    /// Stop the session (`claude stop`). Best-effort; the conversation is kept.
    fn stop(&self, id: &str) -> impl Future<Output = Result<()>> + Send;
}

/// Production controller shelling out to a real `claude` binary.
#[derive(Debug, Clone)]
pub struct RealClaudeBackgroundCli {
    executable: PathBuf,
}

impl RealClaudeBackgroundCli {
    /// `executable` is the resolved `claude` program path (tests point it at a
    /// fake script).
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl ClaudeBackgroundCli for RealClaudeBackgroundCli {
    fn launch(
        &self,
        params: BackgroundLaunch,
    ) -> impl Future<Output = Result<BackgroundHandle>> + Send {
        let executable = self.executable.clone();
        async move {
            let mut cmd = Command::new(&executable);
            cmd.arg("--bg").arg("--name").arg(&params.name);
            if let Some(effort) = &params.effort {
                cmd.arg("--effort").arg(effort);
            }
            cmd.arg(&params.prompt)
                .current_dir(&params.cwd)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            scrub_billing_env(&mut cmd);

            let output = cmd.output().await.with_context(|| {
                format!("spawn `{} --bg` launcher", executable.to_string_lossy())
            })?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            if !output.status.success() {
                anyhow::bail!(
                    "claude --bg launcher exited with {}: {}",
                    output.status,
                    stderr.trim()
                );
            }

            if let Some(id) = parse_backgrounded_id(&stdout) {
                return Ok(BackgroundHandle {
                    id,
                    session_id: None,
                });
            }

            // The launcher did not print a parseable id — discover it by name +
            // cwd from the agents list before giving up.
            let filter = BackgroundFilter {
                id: String::new(),
                name: params.name.clone(),
                cwd: params.cwd.clone(),
            };
            match list_agents(&executable).await {
                Ok(agents) => match select_agent(&agents, &filter) {
                    Some(agent) => Ok(BackgroundHandle {
                        id: agent.id,
                        session_id: agent.session_id,
                    }),
                    None => anyhow::bail!(
                        "claude --bg launched but no background agent named `{}` was found in the agents list (stdout: {})",
                        params.name,
                        stdout.trim()
                    ),
                },
                Err(e) => Err(e.context("discover background id after launch")),
            }
        }
    }

    fn poll(
        &self,
        filter: &BackgroundFilter,
    ) -> impl Future<Output = Result<Option<BackgroundAgent>>> + Send {
        let executable = self.executable.clone();
        let filter = filter.clone();
        async move {
            let agents = list_agents(&executable).await?;
            Ok(select_agent(&agents, &filter))
        }
    }

    fn logs(&self, id: &str) -> impl Future<Output = Result<Option<String>>> + Send {
        let executable = self.executable.clone();
        let id = id.to_string();
        async move {
            let output = Command::new(&executable)
                .arg("logs")
                .arg(&id)
                .stdin(Stdio::null())
                .output()
                .await;
            match output {
                Ok(o) if o.status.success() => {
                    Ok(Some(strip_ansi(&String::from_utf8_lossy(&o.stdout))))
                }
                Ok(o) => {
                    // Daemon socket gone / non-zero exit — evidence is just
                    // unavailable, never fatal.
                    warn!(
                        background_id = %id,
                        status = %o.status,
                        "claude logs read failed — continuing without log evidence"
                    );
                    Ok(None)
                }
                Err(e) => {
                    warn!(
                        background_id = %id,
                        error = %e,
                        "claude logs spawn failed (daemon may be down) — continuing"
                    );
                    Ok(None)
                }
            }
        }
    }

    fn transcript(&self, session_id: &str) -> impl Future<Output = Result<Option<String>>> + Send {
        let session_id = session_id.to_string();
        async move { Ok(locate_transcript(&session_id).await) }
    }

    fn stop(&self, id: &str) -> impl Future<Output = Result<()>> + Send {
        let executable = self.executable.clone();
        let id = id.to_string();
        async move {
            let status = Command::new(&executable)
                .arg("stop")
                .arg(&id)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
            if let Err(e) = status {
                warn!(background_id = %id, error = %e, "claude stop failed");
            }
            Ok(())
        }
    }
}

/// Remove the API/billing override env from a launch command.
fn scrub_billing_env(cmd: &mut Command) {
    for key in BILLING_OVERRIDE_ENV {
        cmd.env_remove(key);
    }
}

/// Locate and read `<config>/projects/*/<session_id>.jsonl`. Scans the project
/// subdirs by session id rather than reconstructing Claude's path-slug rule, so
/// it's robust to slug-derivation drift. Runs the blocking fs walk off the async
/// runtime. `None` when the file can't be found/read.
async fn locate_transcript(session_id: &str) -> Option<String> {
    if session_id.is_empty() {
        return None;
    }
    let session_id = session_id.to_string();
    tokio::task::spawn_blocking(move || locate_transcript_blocking(&session_id))
        .await
        .ok()
        .flatten()
}

fn locate_transcript_blocking(session_id: &str) -> Option<String> {
    let base = claude_projects_dir()?;
    let file_name = format!("{session_id}.jsonl");
    for entry in std::fs::read_dir(&base).ok()? {
        let Ok(entry) = entry else { continue };
        let candidate = entry.path().join(&file_name);
        if let Ok(content) = std::fs::read_to_string(&candidate) {
            return Some(content);
        }
    }
    None
}

/// Claude Code's transcript root: `$CLAUDE_CONFIG_DIR/projects` (honoured if the
/// operator relocated config), else `$HOME/.claude/projects`.
fn claude_projects_dir() -> Option<PathBuf> {
    let base = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".claude")))?;
    Some(base.join("projects"))
}

/// Concatenate the assistant `text` blocks from a Claude session transcript
/// (`.jsonl`, one event per line). Only assistant-role text carries the
/// step-result marker; non-assistant lines and `thinking`/`tool_use` blocks are
/// skipped. Byte-clean — unlike `claude logs`, the marker survives intact here.
pub fn transcript_assistant_text(jsonl: &str) -> String {
    let mut out = String::new();
    for line in jsonl.lines() {
        let Ok(parsed) = serde_json::from_str::<TranscriptLine>(line) else {
            continue;
        };
        let Some(msg) = parsed.message else { continue };
        if msg.role.as_deref() != Some("assistant") {
            continue;
        }
        match msg.content {
            Some(serde_json::Value::String(s)) => {
                out.push_str(&s);
                out.push('\n');
            }
            Some(serde_json::Value::Array(blocks)) => {
                for b in blocks {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text")
                        && let Some(text) = b.get("text").and_then(|t| t.as_str())
                    {
                        out.push_str(text);
                        out.push('\n');
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[derive(Deserialize)]
struct TranscriptLine {
    #[serde(default)]
    message: Option<TranscriptMessage>,
}

#[derive(Deserialize)]
struct TranscriptMessage {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<serde_json::Value>,
}

async fn list_agents(executable: &Path) -> Result<Vec<BackgroundAgent>> {
    let output = Command::new(executable)
        .arg("agents")
        .arg("--json")
        .arg("--all")
        .stdin(Stdio::null())
        .output()
        .await
        .with_context(|| format!("run `{} agents --json`", executable.to_string_lossy()))?;
    if !output.status.success() {
        anyhow::bail!(
            "`claude agents --json` exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    parse_agents(&output.stdout)
}

/// One raw `claude agents --json` row. Interactive sessions omit `id`/`name`/
/// `state`; background sessions omit `pid`. Everything is optional so a mixed
/// list parses without error.
#[derive(Debug, Deserialize)]
struct RawAgent {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default, rename = "sessionId")]
    session_id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

/// Parse `claude agents --json` output into the rows Superkick cares about.
/// Only `kind == "background"` rows are retained — interactive sessions (the
/// operator's own `claude` in the same cwd) are dropped.
pub fn parse_agents(stdout: &[u8]) -> Result<Vec<BackgroundAgent>> {
    let raw: Vec<RawAgent> =
        serde_json::from_slice(stdout).context("parse `claude agents --json` output")?;
    Ok(raw
        .into_iter()
        .filter(|a| a.kind.as_deref() == Some("background"))
        .filter_map(|a| {
            let id = a.id?;
            Some(BackgroundAgent {
                id,
                session_id: a.session_id,
                name: a.name,
                cwd: a.cwd,
                state: BackgroundState::from_state_str(a.state.as_deref().unwrap_or("")),
            })
        })
        .collect())
}

/// Pick the Superkick-owned agent from a parsed list: persisted `id` wins; the
/// `name` + `cwd` pair is the defensive fallback (used before the id is known).
pub fn select_agent(
    agents: &[BackgroundAgent],
    filter: &BackgroundFilter,
) -> Option<BackgroundAgent> {
    if !filter.id.is_empty()
        && let Some(found) = agents.iter().find(|a| a.id == filter.id)
    {
        return Some(found.clone());
    }
    let cwd = filter.cwd.to_string_lossy();
    agents
        .iter()
        .find(|a| {
            a.name.as_deref() == Some(filter.name.as_str())
                && a.cwd.as_deref() == Some(cwd.as_ref())
        })
        .cloned()
}

/// Extract the short background id from a `backgrounded · <id> (…)` launcher
/// line. Tolerant of surrounding text and the `·` separator's UTF-8 bytes.
pub fn parse_backgrounded_id(stdout: &str) -> Option<String> {
    let line = stdout
        .lines()
        .find(|l| l.to_ascii_lowercase().contains("backgrounded"))?;
    // Take the first token after "backgrounded" that looks like an id (drop the
    // word itself and any separator punctuation).
    line.split(|c: char| c.is_whitespace() || c == '·')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .find(|t| !t.eq_ignore_ascii_case("backgrounded"))
        .map(|t| t.trim_matches(|c: char| c == '(' || c == ')').to_string())
        .filter(|t| !t.is_empty())
}

/// Strip ANSI/VT100 escape sequences from terminal-rendered log text. Input
/// cleanup only — Superkick never treats `claude logs` as a structured source.
///
/// Handles CSI (`ESC [ … final`), OSC (`ESC ] … BEL` or `ESC ] … ST`, e.g.
/// terminal-title and Warp `notify` sequences — whose payload would otherwise
/// leak and glue onto following text), and bare two-char `ESC x`.
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('[') => {
                chars.next();
                // CSI: drop until a final byte in 0x40..=0x7E.
                for n in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&n) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                // OSC: drop until BEL (0x07) or ST (ESC \).
                while let Some(n) = chars.next() {
                    if n == '\u{07}' {
                        break;
                    }
                    if n == '\u{1b}' && chars.peek() == Some(&'\\') {
                        chars.next();
                        break;
                    }
                }
            }
            Some(_) => {
                chars.next();
            }
            None => {}
        }
    }
    out
}

/// De-noise terminal scrollback into readable lines for Activity/Logs rows.
///
/// `claude logs` is the rendered TUI screen, not an event stream: the spinner
/// redraws in place (so "thinking…" flattens to N concatenated copies), the
/// `superkick-<id>` footer + spinner bleed onto every captured line, and internal
/// event JSON is mangled by overdraw. Without a full VT100 emulator (deliberately
/// not built — see the audit) it can't be reconstructed perfectly, so this is
/// best-effort input cleanup, never a source-of-truth parser:
/// - strip ANSI + control / replacement / box-drawing / Braille-spinner chars;
/// - truncate each line at the first footer/JSON bleed sentinel
///   (`superkick-<id>`, `{"`, `":`) — that trailing garbage repeats every frame;
/// - collapse a repeated word-cycle to one instance (kills spinner overdraw);
/// - drop JSON fragments, sub-2-word fragments, and duplicate phrases (by a
///   counter/id-insensitive key, so re-drawn frames collapse to one row).
///
/// It never infers tool calls — honest signal only (state, `$ cmd` echoes, prose).
pub fn denoise_log_lines(raw: &str) -> Vec<String> {
    let cleaned = strip_ansi(raw);
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for line in cleaned.lines() {
        if let Some(clean) = clean_log_line(line) {
            if seen.insert(normalize_dedupe_key(&clean)) {
                out.push(clean);
            }
        }
    }
    out
}

/// Best-effort cleanup of one scrollback line. `None` when it is pure noise.
fn clean_log_line(raw: &str) -> Option<String> {
    let stripped: String = raw
        .chars()
        .map(|c| if is_noise_char(c) { ' ' } else { c })
        .collect();
    let words: Vec<&str> = truncate_at_bleed(&stripped).split_whitespace().collect();
    let words = collapse_word_cycle(&words);
    // A redrawn spinner ("Orbiting…Orbiting…", "thinking…thinking…") collapses to
    // one repeated verb with digit/symbol junk between frames. Require >=2
    // DISTINCT real words (alphabetic core, case/punct-insensitive) so that spam
    // drops while genuine prose ("23 tool uses … Searching for 1 pattern") stays.
    let mut distinct = HashSet::new();
    for w in &words {
        let core: String = w
            .chars()
            .filter(|c| c.is_alphabetic())
            .flat_map(char::to_lowercase)
            .collect();
        if !core.is_empty() {
            distinct.insert(core);
        }
    }
    if distinct.len() < 2 {
        return None;
    }
    let joined = words.join(" ");
    let joined = joined.trim();
    if looks_like_json(joined) {
        return None;
    }
    Some(joined.to_string())
}

/// Control, replacement (`U+FFFD`), and the glyph blocks Claude's TUI uses for
/// spinner/box/progress animation — mapped to spaces. They carry no signal and,
/// left in, break the word-cycle/dedup heuristics (each frame looks distinct).
fn is_noise_char(c: char) -> bool {
    c.is_control()
        || c == '\u{fffd}'
        || ('\u{2300}'..='\u{23ff}').contains(&c) // Misc Technical (⏺ ⎿ ⏸)
        || ('\u{2500}'..='\u{25ff}').contains(&c) // box-drawing, blocks, geometric (● ○ ◆)
        || ('\u{2700}'..='\u{27bf}').contains(&c) // dingbats (✳ ✢ ✶ ✻ ✽ ✓ ✗)
        || ('\u{2800}'..='\u{28ff}').contains(&c) // Braille spinner
        || ('\u{2b00}'..='\u{2bff}').contains(&c) // Misc Symbols & Arrows
}

/// Cut a line at the first footer/JSON bleed: the `superkick-` session footer or
/// a JSON `{"`/`"key":` fragment. Everything after is terminal overdraw.
fn truncate_at_bleed(s: &str) -> &str {
    let mut cut = s.len();
    for sentinel in ["superkick-", "{\"", "\":\"", "\":"] {
        if let Some(i) = s.find(sentinel) {
            cut = cut.min(i);
        }
    }
    while cut > 0 && !s.is_char_boundary(cut) {
        cut -= 1;
    }
    &s[..cut]
}

/// If the word list is a phrase repeated end-to-end (smallest period `p`), keep
/// the first `p` words. Catches `thinking with xhigh effort` re-drawn N times.
fn collapse_word_cycle<'a>(words: &[&'a str]) -> Vec<&'a str> {
    let n = words.len();
    if n < 4 {
        return words.to_vec();
    }
    for p in 1..=n / 2 {
        if (p..n).all(|i| words[i] == words[i - p]) {
            return words[..p].to_vec();
        }
    }
    words.to_vec()
}

fn looks_like_json(s: &str) -> bool {
    s.contains("\":\"") || s.contains("\":") || s.contains("tool_name") || s.contains("session_id")
}

/// Dedupe key that ignores volatile counters/ids so re-drawn frames of the same
/// phrase collapse to one row — keeps only lowercase letters.
pub fn normalize_dedupe_key(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphabetic())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn billing_override_env_covers_required_keys() {
        assert!(BILLING_OVERRIDE_ENV.contains(&"ANTHROPIC_API_KEY"));
        assert!(BILLING_OVERRIDE_ENV.contains(&"ANTHROPIC_AUTH_TOKEN"));
        assert!(BILLING_OVERRIDE_ENV.contains(&"ANTHROPIC_BASE_URL"));
    }

    #[test]
    fn state_mapping_covers_observed_vocabulary() {
        assert_eq!(
            BackgroundState::from_state_str("working"),
            BackgroundState::Working
        );
        assert_eq!(
            BackgroundState::from_state_str("BLOCKED"),
            BackgroundState::Blocked
        );
        assert_eq!(
            BackgroundState::from_state_str("done"),
            BackgroundState::Done
        );
        assert_eq!(
            BackgroundState::from_state_str("failed"),
            BackgroundState::Failed
        );
        assert_eq!(
            BackgroundState::from_state_str("stopped"),
            BackgroundState::Stopped
        );
        assert_eq!(
            BackgroundState::from_state_str("queued"),
            BackgroundState::Unknown("queued".into())
        );
    }

    #[test]
    fn terminal_states_are_done_failed_stopped() {
        assert!(BackgroundState::Done.is_terminal());
        assert!(BackgroundState::Failed.is_terminal());
        assert!(BackgroundState::Stopped.is_terminal());
        assert!(!BackgroundState::Working.is_terminal());
        assert!(!BackgroundState::Blocked.is_terminal());
    }

    #[test]
    fn parse_agents_drops_interactive_and_keeps_background() {
        let json = br#"[
            {"pid":98209,"cwd":"/work","kind":"interactive","startedAt":1,"sessionId":"i-1"},
            {"id":"6106fcf5","cwd":"/work/wt","kind":"background","startedAt":2,
             "sessionId":"6106fcf5-full","name":"superkick-step","state":"working"}
        ]"#;
        let agents = parse_agents(json).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].id, "6106fcf5");
        assert_eq!(agents[0].name.as_deref(), Some("superkick-step"));
        assert_eq!(agents[0].state, BackgroundState::Working);
        assert_eq!(agents[0].session_id.as_deref(), Some("6106fcf5-full"));
    }

    #[test]
    fn parse_agents_tolerates_missing_state() {
        let json = br#"[{"id":"a1","cwd":"/w","kind":"background","sessionId":"a1-x"}]"#;
        let agents = parse_agents(json).unwrap();
        assert_eq!(agents[0].state, BackgroundState::Unknown(String::new()));
    }

    #[test]
    fn select_agent_prefers_persisted_id() {
        let agents = vec![
            BackgroundAgent {
                id: "wrong".into(),
                session_id: None,
                name: Some("superkick-step".into()),
                cwd: Some("/wt".into()),
                state: BackgroundState::Working,
            },
            BackgroundAgent {
                id: "right".into(),
                session_id: None,
                name: Some("other".into()),
                cwd: Some("/elsewhere".into()),
                state: BackgroundState::Done,
            },
        ];
        let filter = BackgroundFilter {
            id: "right".into(),
            name: "superkick-step".into(),
            cwd: PathBuf::from("/wt"),
        };
        let found = select_agent(&agents, &filter).expect("matched by id");
        assert_eq!(found.id, "right");
    }

    #[test]
    fn select_agent_falls_back_to_name_and_cwd_when_id_unknown() {
        let agents = vec![BackgroundAgent {
            id: "discovered".into(),
            session_id: None,
            name: Some("superkick-step".into()),
            cwd: Some("/wt".into()),
            state: BackgroundState::Working,
        }];
        let filter = BackgroundFilter {
            id: String::new(),
            name: "superkick-step".into(),
            cwd: PathBuf::from("/wt"),
        };
        let found = select_agent(&agents, &filter).expect("matched by name+cwd");
        assert_eq!(found.id, "discovered");
    }

    #[test]
    fn select_agent_ignores_same_cwd_when_name_differs() {
        let agents = vec![BackgroundAgent {
            id: "someone-else".into(),
            session_id: None,
            name: Some("not-superkick".into()),
            cwd: Some("/wt".into()),
            state: BackgroundState::Working,
        }];
        let filter = BackgroundFilter {
            id: String::new(),
            name: "superkick-step".into(),
            cwd: PathBuf::from("/wt"),
        };
        assert!(select_agent(&agents, &filter).is_none());
    }

    #[test]
    fn parse_backgrounded_id_extracts_short_id() {
        assert_eq!(
            parse_backgrounded_id("backgrounded · 568bafa8 (idle — send a prompt to start)"),
            Some("568bafa8".to_string())
        );
        assert_eq!(
            parse_backgrounded_id("noise\nBackgrounded 6106fcf5\nmore"),
            Some("6106fcf5".to_string())
        );
        assert_eq!(parse_backgrounded_id("nothing here"), None);
    }

    #[test]
    fn strip_ansi_removes_escape_sequences() {
        assert_eq!(strip_ansi("\u{1b}[1mhello\u{1b}[0m world"), "hello world");
        assert_eq!(strip_ansi("plain"), "plain");
        // Marker survives so the StepResultScanner still finds it.
        assert!(
            strip_ansi("\u{1b}[32mSUPERKICK_STEP_RESULT_BEGIN\u{1b}[0m")
                .contains("SUPERKICK_STEP_RESULT_BEGIN")
        );
    }

    #[test]
    fn denoise_keeps_real_lines_drops_spinner_and_dupes() {
        let raw = "\u{1b}[2m⠋\u{1b}[0m\n\
                   Searching for 1 pattern, running 2 shell commands…\n\
                   ───────────\n\
                   $ git status && git branch --show-current\n\
                   $ git status && git branch --show-current\n\
                   \n";
        let lines = denoise_log_lines(raw);
        assert_eq!(
            lines,
            vec![
                "Searching for 1 pattern, running 2 shell commands…".to_string(),
                "$ git status && git branch --show-current".to_string(),
            ]
        );
    }

    #[test]
    fn denoise_truncates_footer_bleed_and_collapses_spinner() {
        // A real captured line: text, then the session footer + spinner overdraw
        // re-printed on the same screen row.
        let raw = "18 tokens · thinking with xhigh effort superkick-8be9b50d-c396-4435 \u{fffd}*5*6thinking with xhigh effort8thinking with xhigh effort";
        let lines = denoise_log_lines(raw);
        assert_eq!(lines.len(), 1);
        // Everything from `superkick-` on (the repeated spinner) is gone.
        assert!(lines[0].starts_with("18 tokens"));
        assert!(!lines[0].contains("superkick-"));
        assert_eq!(lines[0].matches("thinking with xhigh effort").count(), 1);
    }

    #[test]
    fn denoise_drops_mangled_json_event_lines() {
        let raw = "vent\":\"tool_complete\",\"session_id\":\"4a8d36f4\",\"tool_name\":\"Bash\"}";
        assert!(denoise_log_lines(raw).is_empty());
    }

    #[test]
    fn denoise_drops_spinner_glyph_spam() {
        // Real capture: one spinner verb redrawn in place, glyph + digit junk
        // between frames. Collapses to a single distinct word → dropped.
        let raw = "✳ ✢9 30 Orbiting… 6 ·Orbiting… ⏺ Orbiting… ✶Orbiting…40 ✻Orbiting…";
        assert!(
            denoise_log_lines(raw).is_empty(),
            "lone repeated spinner verb must be dropped: {:?}",
            denoise_log_lines(raw)
        );
    }

    #[test]
    fn denoise_keeps_tool_use_summary_with_numbers() {
        let raw = "23 tool uses · 37.5k tokens ⎿ Searching for 1 pattern, reading 14 files…";
        let lines = denoise_log_lines(raw);
        assert_eq!(lines.len(), 1, "got {lines:?}");
        assert!(lines[0].contains("tool uses"));
        assert!(lines[0].contains("Searching"));
    }

    #[test]
    fn denoise_collapses_word_cycle() {
        assert_eq!(
            collapse_word_cycle(&["a", "b", "a", "b", "a", "b"]),
            vec!["a", "b"]
        );
        // Partial trailing cycle still collapses.
        assert_eq!(
            collapse_word_cycle(&["go", "now", "go", "now", "go"]),
            vec!["go", "now"]
        );
        assert_eq!(
            collapse_word_cycle(&["one", "two", "three"]),
            vec!["one", "two", "three"]
        );
    }

    #[test]
    fn normalize_key_ignores_counters_and_ids() {
        assert_eq!(
            normalize_dedupe_key("thinking with xhigh effort40"),
            normalize_dedupe_key("thinking with xhigh effort")
        );
    }

    #[test]
    fn strip_ansi_drops_osc_title_payload() {
        // OSC terminal-title (BEL-terminated) and Warp notify (ST-terminated)
        // must not leak their payload onto following text.
        assert_eq!(
            strip_ansi("\u{1b}]0;some title\u{07}SUPERKICK_STEP_RESULT_BEGIN"),
            "SUPERKICK_STEP_RESULT_BEGIN"
        );
        assert_eq!(strip_ansi("\u{1b}]777;notify;done\u{1b}\\rest"), "rest");
    }

    #[test]
    fn transcript_assistant_text_extracts_clean_marker() {
        let jsonl = concat!(
            r#"{"type":"system","subtype":"init","session_id":"s1"}"#,
            "\n",
            r#"{"message":{"role":"assistant","content":[{"type":"thinking","thinking":"..."},{"type":"text","text":"hello\nSUPERKICK_STEP_RESULT_BEGIN"}]}}"#,
            "\n",
            r#"{"message":{"role":"user","content":[{"type":"text","text":"ignored user text"}]}}"#,
            "\n",
            r#"{"message":{"role":"assistant","content":[{"type":"text","text":"{\"status\":\"completed\"}\nSUPERKICK_STEP_RESULT_END"}]}}"#,
        );
        let text = transcript_assistant_text(jsonl);
        assert!(text.contains("SUPERKICK_STEP_RESULT_BEGIN"));
        assert!(text.contains("SUPERKICK_STEP_RESULT_END"));
        // Only assistant text — user message and thinking blocks are excluded.
        assert!(!text.contains("ignored user text"));
        assert!(!text.contains("\"thinking\""));
    }

    #[test]
    fn transcript_assistant_text_tolerates_string_content_and_junk_lines() {
        let jsonl = concat!(
            "not json at all\n",
            r#"{"message":{"role":"assistant","content":"plain string body"}}"#,
        );
        assert_eq!(transcript_assistant_text(jsonl).trim(), "plain string body");
    }
}
