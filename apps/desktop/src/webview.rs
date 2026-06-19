use tauri::Manager;

/// Same-origin absolute paths only: `//host` is protocol-relative (would leave
/// the local server) and anything else is not a path — both fall back to root.
#[must_use]
pub fn sanitize_return_path(path: Option<String>) -> String {
    match path {
        Some(path) if path.starts_with('/') && !path.starts_with("//") => path,
        _ => String::new(),
    }
}

pub(crate) fn navigate_with_return_path(
    handle: &tauri::AppHandle,
    base: &str,
    return_path: Option<String>,
) {
    let candidate = format!("{base}{}", sanitize_return_path(return_path));
    match candidate.parse::<tauri::Url>() {
        Ok(url) => navigate_url(handle, url),
        Err(err) => {
            tracing::error!("constructed an invalid url {candidate}: {err}");
            navigate(handle, base);
        }
    }
}

fn navigate(handle: &tauri::AppHandle, url: &str) {
    match url.parse::<tauri::Url>() {
        Ok(url) => navigate_url(handle, url),
        Err(err) => tracing::error!("constructed an invalid url {url}: {err}"),
    }
}

pub(crate) fn navigate_url(handle: &tauri::AppHandle, url: tauri::Url) {
    let inner = handle.clone();
    let dispatched = handle.run_on_main_thread(move || {
        let Some(window) = inner.get_webview_window("main") else {
            tracing::error!("no `main` window to navigate");
            return;
        };
        if let Err(err) = window.navigate(url) {
            tracing::error!("failed to navigate the webview: {err}");
        }
    });
    if let Err(err) = dispatched {
        tracing::error!("failed to dispatch webview navigation: {err}");
    }
}
