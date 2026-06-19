fn main() {
    // Remote origins (the served dashboard) require an explicit ACL entry per command.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "list_projects",
            "boot_state",
            "add_project",
            "select_project",
            "remove_project",
            "configure_project",
            "report_attention",
            "retry_boot",
            "show_picker",
        ]),
    ))
    .expect("failed to run tauri-build");
}
