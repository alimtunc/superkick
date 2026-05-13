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
    Some(
        Response::builder()
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(asset.data.into_owned()))
            .expect("valid response"),
    )
}
