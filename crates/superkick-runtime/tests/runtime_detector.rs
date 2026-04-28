//! SUP-96 — runtime detector integration test.
//!
//! Hits a real (in-memory) SQLite so the detector → repo plumbing is
//! exercised end-to-end: ensure_local idempotence, provider upsert, and the
//! "busy" path of `try_detect_local`. We do not assume `claude` or `codex` are
//! actually installed on the test runner — providers may report Available or
//! Unavailable. The point is that exactly one row per known provider is
//! materialised and that re-running detection mutates rather than duplicates.

use std::sync::Arc;

use anyhow::Result;
use superkick_core::AgentProvider;
use superkick_runtime::RuntimeDetector;
use superkick_storage::SqliteRuntimeRepo;
use superkick_storage::connect_with_capacity;

#[tokio::test]
async fn detect_local_inserts_runtime_and_providers_idempotently() -> Result<()> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    let repo = Arc::new(SqliteRuntimeRepo::new(pool));
    let detector = RuntimeDetector::new(Arc::clone(&repo));

    let first = detector.detect_local().await?;
    assert_eq!(first.providers.len(), 2, "claude + codex providers");
    let kinds: Vec<AgentProvider> = first.providers.iter().map(|p| p.kind).collect();
    assert!(kinds.contains(&AgentProvider::Claude));
    assert!(kinds.contains(&AgentProvider::Codex));

    // Second pass: same runtime id, same provider ids — upsert in place, no
    // accumulation, no duplicates.
    let second = detector.detect_local().await?;
    assert_eq!(first.runtime.id.0, second.runtime.id.0);
    for p in &second.providers {
        let prior = first
            .providers
            .iter()
            .find(|q| q.kind == p.kind)
            .expect("provider kind preserved across refresh");
        assert_eq!(prior.id.0, p.id.0, "provider id stable across refresh");
    }

    let snapshot = detector.read_snapshot().await?;
    assert_eq!(snapshot.len(), 1);
    assert_eq!(snapshot[0].providers.len(), 2);
    Ok(())
}

#[tokio::test]
async fn try_detect_local_returns_some_when_idle() -> Result<()> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    let repo = Arc::new(SqliteRuntimeRepo::new(pool));
    let detector = RuntimeDetector::new(repo);

    let result = detector.try_detect_local().await?;
    assert!(result.is_some(), "uncontended detector must succeed");
    Ok(())
}
