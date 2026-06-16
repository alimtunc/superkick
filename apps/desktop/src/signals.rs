//! SIGTERM/SIGINT → clean child shutdown. Tauri only runs its exit cleanup on
//! window close / app quit; a termination signal would otherwise kill the
//! shell and orphan the spawned superkick-api child.

use crate::supervisor::Supervisor;

#[cfg(unix)]
pub fn block_termination_signals() {
    // SAFETY: plain sigset manipulation on the main thread before any other
    // thread exists, so every later thread inherits the blocked mask.
    unsafe {
        let mut set: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&mut set);
        libc::sigaddset(&mut set, libc::SIGTERM);
        libc::sigaddset(&mut set, libc::SIGINT);
        libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
    }
}

#[cfg(unix)]
pub fn spawn_signal_listener(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        // SAFETY: sigwait on the set this thread's inherited mask blocks; it
        // simply parks until one of the two signals arrives.
        let signal = unsafe {
            let mut set: libc::sigset_t = std::mem::zeroed();
            libc::sigemptyset(&mut set);
            libc::sigaddset(&mut set, libc::SIGTERM);
            libc::sigaddset(&mut set, libc::SIGINT);
            let mut signal: libc::c_int = 0;
            if libc::sigwait(&set, &mut signal) != 0 {
                return;
            }
            signal
        };
        tracing::info!("received signal {signal}, stopping the server");
        if let Some(supervisor) = tauri::Manager::try_state::<Supervisor>(&handle) {
            supervisor.stop_all();
        }
        handle.exit(0);
        // Backstop: if the event loop never processes the exit request, do not
        // hang as a zombie shell — the child is already down.
        std::thread::sleep(std::time::Duration::from_secs(3));
        std::process::exit(0);
    });
}

#[cfg(not(unix))]
pub fn block_termination_signals() {}

#[cfg(not(unix))]
pub fn spawn_signal_listener(_handle: tauri::AppHandle) {}
