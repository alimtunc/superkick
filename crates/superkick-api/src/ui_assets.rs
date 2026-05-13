use axum::Router;
use axum::body::Body;
use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../ui/dist"]
struct UiAssets;

pub fn router() -> Router {
    Router::new().fallback(spa_handler)
}

async fn spa_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    serve_asset(path).unwrap_or_else(|| {
        serve_asset("index.html").unwrap_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                "dashboard assets missing — rebuild with `just install`",
            )
                .into_response()
        })
    })
}

fn serve_asset(path: &str) -> Option<Response> {
    let asset = UiAssets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    // Vite emits content-hashed files under assets/; everything else (index.html,
    // favicon, etc.) must revalidate so upgrades don't serve a stale SPA shell.
    let cache_control = if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    Some(
        Response::builder()
            .header(header::CONTENT_TYPE, mime.as_ref())
            .header(header::CACHE_CONTROL, cache_control)
            .body(Body::from(asset.data.into_owned()))
            .expect("valid response"),
    )
}
