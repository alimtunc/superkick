use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Check that a Superkick server is reachable on the given port, or bail.
pub fn ensure_server_reachable(port: u16) -> anyhow::Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_err() {
        anyhow::bail!(
            "No Superkick server on port {}. Start one with: superkick serve",
            port
        );
    }
    Ok(())
}
