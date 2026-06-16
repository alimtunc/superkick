//! GUI launches (Finder/Spotlight) inherit launchd's minimal PATH, so provider
//! CLIs installed via homebrew (`.zprofile`) or exported in `.zshrc` are
//! invisible to the spawned api server and the runs it supervises. Asking the
//! user's interactive login shell for its PATH mirrors what VS Code does.

const START_MARKER: &str = "<superkick-path>";
const END_MARKER: &str = "</superkick-path>";

/// Must run at process start, before any thread is spawned.
#[cfg(unix)]
pub fn inherit_login_shell_path() {
    let Some(path) = login_shell_path() else {
        return;
    };
    // SAFETY: called first thing in `run()`, while the process is still single-threaded.
    unsafe { std::env::set_var("PATH", &path) };
}

#[cfg(not(unix))]
pub fn inherit_login_shell_path() {}

#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let command = format!(r#"printf '%s%s%s' '{START_MARKER}' "$PATH" '{END_MARKER}'"#);
    let output = std::process::Command::new(shell)
        .args(["-i", "-l", "-c", &command])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    extract_marked_path(&stdout)
}

/// Rc files may print noise around the markers; only the delimited PATH counts.
pub fn extract_marked_path(stdout: &str) -> Option<String> {
    let start = stdout.find(START_MARKER)? + START_MARKER.len();
    let end = start + stdout[start..].find(END_MARKER)?;
    let path = stdout[start..end].trim();
    (!path.is_empty()).then(|| path.to_string())
}
