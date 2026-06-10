use std::time::Duration;

const READ_TIMEOUT: Duration = Duration::from_secs(2);
const WRITE_TIMEOUT: Duration = Duration::from_secs(10);

/// GET with the CLI's standard 2s timeout — every local read goes through
/// this so a wedged server can never hang the CLI.
pub fn timed_get(url: &str) -> Result<ureq::http::Response<ureq::Body>, ureq::Error> {
    ureq::get(url)
        .config()
        .timeout_global(Some(READ_TIMEOUT))
        .build()
        .call()
}

/// POST with a bounded timeout (mutations get more headroom than reads).
pub fn timed_post(
    url: &str,
    json_body: Option<&str>,
) -> Result<ureq::http::Response<ureq::Body>, ureq::Error> {
    let req = ureq::post(url)
        .config()
        .timeout_global(Some(WRITE_TIMEOUT))
        .build();
    match json_body {
        Some(body) => req
            .header("Content-Type", "application/json")
            .send(body.as_bytes()),
        None => req.send_empty(),
    }
}

/// Check that a Superkick server is reachable on the given port, or bail.
pub fn ensure_server_reachable(port: u16) -> anyhow::Result<()> {
    let url = format!("http://127.0.0.1:{port}/api/health");
    match timed_get(&url) {
        Ok(resp) if resp.status() == 200 => Ok(()),
        _ => anyhow::bail!(
            "No healthy Superkick server on port {}. Start one with: superkick serve",
            port
        ),
    }
}
