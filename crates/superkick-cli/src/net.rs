/// Check that a Superkick server is reachable on the given port, or bail.
pub fn ensure_server_reachable(port: u16) -> anyhow::Result<()> {
    let url = format!("http://127.0.0.1:{port}/health");
    match ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(2)))
        .build()
        .call()
    {
        Ok(resp) if resp.status() == 200 => Ok(()),
        _ => anyhow::bail!(
            "No healthy Superkick server on port {}. Start one with: superkick serve",
            port
        ),
    }
}
