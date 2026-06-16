use std::time::Duration;

use superkick_desktop_lib::error::ServerError;
use superkick_desktop_lib::server_process::{
    ServerProcess, SpawnConfig, read_port_file, remove_stale_port_file, wait_for_port_file,
};

#[test]
fn read_port_file_parses_trimmed_port() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    std::fs::write(&path, "3142\n").expect("write port file");
    assert_eq!(read_port_file(&path).expect("read port"), 3142);
}

#[test]
fn read_port_file_rejects_non_numeric_contents() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    std::fs::write(&path, "not-a-port").expect("write port file");
    assert!(matches!(
        read_port_file(&path),
        Err(ServerError::PortFileParse { .. })
    ));
}

#[test]
fn read_port_file_rejects_empty_contents() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    std::fs::write(&path, "\n").expect("write port file");
    assert!(matches!(
        read_port_file(&path),
        Err(ServerError::PortFileParse { .. })
    ));
}

#[test]
fn read_port_file_reports_missing_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("absent");
    assert!(matches!(
        read_port_file(&path),
        Err(ServerError::PortFileRead { .. })
    ));
}

#[test]
fn remove_stale_port_file_deletes_existing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    std::fs::write(&path, "3100").expect("write port file");
    remove_stale_port_file(&path).expect("remove stale");
    assert!(!path.exists());
}

#[test]
fn remove_stale_port_file_is_noop_when_absent() {
    let dir = tempfile::tempdir().expect("tempdir");
    remove_stale_port_file(&dir.path().join("absent")).expect("noop on absent");
}

#[test]
fn wait_for_port_file_reads_existing_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    std::fs::write(&path, "4200").expect("write port file");
    assert_eq!(
        wait_for_port_file(&path, Duration::from_secs(1)).expect("present file resolves"),
        4200
    );
}

#[test]
fn wait_for_port_file_times_out_when_absent() {
    let dir = tempfile::tempdir().expect("tempdir");
    let result = wait_for_port_file(&dir.path().join("absent"), Duration::from_millis(120));
    assert!(matches!(result, Err(ServerError::PortFileTimeout { .. })));
}

#[test]
fn wait_for_port_file_resolves_when_file_appears_late() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".superkick-port");
    let writer_path = path.clone();
    let writer = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(80));
        std::fs::write(&writer_path, "5123").expect("write port file");
    });
    let port = wait_for_port_file(&path, Duration::from_secs(5)).expect("late file resolves");
    writer.join().expect("writer thread");
    assert_eq!(port, 5123);
}

#[test]
fn spawn_reports_missing_binary_before_touching_the_port_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let config = SpawnConfig {
        binary: dir.path().join("does-not-exist"),
        project_root: dir.path().to_path_buf(),
        config_path: "superkick.yaml".to_string(),
        database_url: "sqlite::memory:".to_string(),
        cache_dir: ".superkick-cache".to_string(),
        port_file: dir.path().join("data").join(".superkick-port"),
        start_port: 3100,
        linear_api_key: None,
    };
    assert!(matches!(
        ServerProcess::spawn(config),
        Err(ServerError::BinaryMissing { .. })
    ));
}

/// The port file lives outside the fake project root, like the desktop's
/// app-data layout, so these tests prove the child never writes in the repo.
#[cfg(unix)]
fn spawn_script(dir: &std::path::Path, body: &str) -> ServerProcess {
    let script = dir.join("child.sh");
    std::fs::write(&script, format!("#!/bin/sh\n{body}\n")).expect("write script");
    let mut perms = std::fs::metadata(&script).expect("stat").permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o755);
    std::fs::set_permissions(&script, perms).expect("chmod");
    let project_root = dir.join("repo");
    std::fs::create_dir_all(&project_root).expect("create project root");
    let data_dir = dir.join("data");
    std::fs::create_dir_all(&data_dir).expect("create data dir");
    let config = SpawnConfig {
        binary: script,
        project_root,
        config_path: "superkick.yaml".to_string(),
        database_url: "sqlite::memory:".to_string(),
        cache_dir: data_dir.join("cache").display().to_string(),
        port_file: data_dir.join(".superkick-port"),
        start_port: 3100,
        linear_api_key: None,
    };
    ServerProcess::spawn(config).expect("spawn script child")
}

#[cfg(unix)]
#[test]
fn spawned_child_receives_the_port_file_path_through_the_environment() {
    let dir = tempfile::tempdir().expect("tempdir");
    let server = spawn_script(dir.path(), "echo 4321 > \"$SUPERKICK_PORT_FILE\"\nsleep 60");

    assert_eq!(
        server.port_file(),
        dir.path().join("data").join(".superkick-port")
    );
    let port = wait_for_port_file(server.port_file(), Duration::from_secs(5))
        .expect("child writes the env-provided port file");
    assert_eq!(port, 4321);
    assert!(
        !dir.path().join("repo").join(".superkick-port").exists(),
        "no port file may appear inside the project root"
    );
    server.shutdown().expect("shutdown");
}

#[cfg(unix)]
#[test]
fn log_tail_captures_child_stdout_and_stderr() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut server = spawn_script(dir.path(), "echo out-line\necho err-line 1>&2\nsleep 60");

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while server.log_tail().len() < 2 && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    let tail = server.log_tail();
    assert!(tail.contains(&"out-line".to_string()), "tail: {tail:?}");
    assert!(tail.contains(&"err-line".to_string()), "tail: {tail:?}");
    assert!(!server.exited().expect("probe"), "child should still run");
    server.shutdown().expect("shutdown");
}

#[cfg(unix)]
#[test]
fn exited_reports_a_dead_child() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut server = spawn_script(dir.path(), "exit 3");

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        if server.exited().expect("probe") {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "child never reported as exited"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(unix)]
#[test]
fn shutdown_terminates_a_cooperative_child_within_the_grace_window() {
    let dir = tempfile::tempdir().expect("tempdir");
    let server = spawn_script(dir.path(), "sleep 60");
    let port_file = server.port_file().to_path_buf();
    std::fs::write(&port_file, "3100").expect("seed port file");

    let started = std::time::Instant::now();
    server.shutdown().expect("shutdown should succeed");
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "cooperative child must exit within the grace window"
    );
    assert!(
        !port_file.exists(),
        "shutdown must clean the explicit port file"
    );
}
