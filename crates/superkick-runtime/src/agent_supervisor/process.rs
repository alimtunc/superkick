//! OS-level process control for supervised agents.

use tracing::warn;

/// Send SIGKILL to a process by PID.
///
/// Used for timeout/cancellation since `portable-pty::Child` has been moved
/// into the blocking wait task. Silently ignores ESRCH (process already exited).
pub(crate) fn kill_by_pid(pid: Option<u32>) {
    let Some(pid) = pid else { return };

    // SAFETY: libc::kill sends a signal to a process. We only call this with
    // a PID we own (the spawned child), and only during timeout/cancellation.
    let ret = unsafe { libc::kill(pid as i32, libc::SIGKILL) };
    if ret != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            warn!(pid, "failed to SIGKILL agent: {err}");
        }
    }
}
