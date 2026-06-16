fn main() {
    println!("cargo:rerun-if-changed=../../apps/web/dist");
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_EMBEDDED_UI");

    // rust-embed errors at proc-macro time if the embedded folder is missing.
    // CI runs clippy with `--all-features` without first building the UI, so
    // make the directory exist (empty is fine — the runtime SPA handler
    // already returns a "rebuild with `just install`" message when no assets
    // are bundled).
    if std::env::var_os("CARGO_FEATURE_EMBEDDED_UI").is_some() {
        let dist = std::path::Path::new("../../apps/web/dist");
        if !dist.exists() {
            std::fs::create_dir_all(dist).expect("create ui/dist placeholder for rust-embed");
        }
    }
}
