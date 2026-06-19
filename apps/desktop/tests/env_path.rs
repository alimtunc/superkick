use superkick_desktop_lib::env_path::extract_marked_path;

#[test]
fn extracts_the_path_between_markers() {
    let stdout = "<superkick-path>/opt/homebrew/bin:/usr/bin</superkick-path>";
    assert_eq!(
        extract_marked_path(stdout),
        Some("/opt/homebrew/bin:/usr/bin".to_string())
    );
}

#[test]
fn ignores_rc_noise_around_the_markers() {
    let stdout = "welcome from zshrc\n<superkick-path>/usr/bin</superkick-path>\nbye";
    assert_eq!(extract_marked_path(stdout), Some("/usr/bin".to_string()));
}

#[test]
fn rejects_missing_markers_and_empty_paths() {
    assert_eq!(extract_marked_path("no markers here"), None);
    assert_eq!(extract_marked_path("<superkick-path>/usr/bin"), None);
    assert_eq!(
        extract_marked_path("<superkick-path>  </superkick-path>"),
        None
    );
}
