use std::time::Duration;

use superkick_desktop_lib::error::ServerError;
use superkick_desktop_lib::server_process::{
    ServerProcess, SpawnConfig, port_file_path, read_port_file, remove_stale_port_file,
    wait_for_port_file,
};

#[test]
fn port_file_path_uses_project_root_for_bare_config() {
    let root = std::path::Path::new("/tmp/project");
    assert_eq!(
        port_file_path(root, "superkick.yaml"),
        root.join(".superkick-port")
    );
}

#[test]
fn port_file_path_honours_config_subdirectory() {
    let root = std::path::Path::new("/tmp/project");
    assert_eq!(
        port_file_path(root, "config/superkick.yaml"),
        root.join("config").join(".superkick-port")
    );
}

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
        start_port: 3100,
    };
    assert!(matches!(
        ServerProcess::spawn(config),
        Err(ServerError::BinaryMissing { .. })
    ));
}
