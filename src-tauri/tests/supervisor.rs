use std::path::Path;

use superkick_desktop_lib::spawn::project_data_paths;
use superkick_desktop_lib::webview::sanitize_return_path;

#[test]
fn keeps_an_absolute_path_with_query() {
    assert_eq!(
        sanitize_return_path(Some("/settings?pane=integrations".into())),
        "/settings?pane=integrations"
    );
}

#[test]
fn rejects_a_protocol_relative_url() {
    assert_eq!(sanitize_return_path(Some("//evil.com".into())), "");
}

#[test]
fn rejects_a_relative_path() {
    assert_eq!(sanitize_return_path(Some("no-slash".into())), "");
}

#[test]
fn defaults_to_root_when_absent() {
    assert_eq!(sanitize_return_path(None), "");
}

#[test]
fn project_data_paths_nest_everything_under_the_project_id() {
    let root = Path::new("/data/projects");
    let paths = project_data_paths(root, "id-a");
    assert_eq!(paths.db_url, "sqlite:/data/projects/id-a/superkick.db");
    assert_eq!(paths.cache_dir, root.join("id-a").join("cache"));
    assert_eq!(paths.port_file, root.join("id-a").join(".superkick-port"));
}

#[test]
fn project_data_paths_are_disjoint_across_projects() {
    let root = Path::new("/data/projects");
    let a = project_data_paths(root, "id-a");
    let b = project_data_paths(root, "id-b");
    assert_ne!(a.db_url, b.db_url);
    assert_ne!(a.cache_dir, b.cache_dir);
    assert_ne!(a.port_file, b.port_file);
}

#[test]
fn project_data_paths_keep_spaces_verbatim_in_the_db_url() {
    let root = Path::new("/Users/me/Library/Application Support/superkick/projects");
    let paths = project_data_paths(root, "abc");
    assert!(paths.db_url.starts_with("sqlite:"), "{}", paths.db_url);
    assert_eq!(
        paths.db_url,
        "sqlite:/Users/me/Library/Application Support/superkick/projects/abc/superkick.db"
    );
}
