//! SUP-148 -- IssueWorkspaceContext + memory ledger HTTP surface.
//!
//! Three routes hang off `/api/issues/{id}`:
//!   * `GET /context` -- load (or attach on first call) the workspace aggregate.
//!   * `GET /context/memory?cursor=&limit=` -- newest-first paginated ledger.
//!   * `POST /context/memory` -- append a new entry; redaction guard returns 422.
//!
//! All three resolve the Linear `:id` (which may be a UUID or an identifier
//! like `SUP-148`) through the [`IssueLookup`] seam. Production wires the
//! real `LinearClient`; tests provide an in-process stub so the integration
//! suite doesn't hit network.
//!
//! Domain validation (empty role / text, credential redaction) lives in
//! `superkick-core::memory_entry`; the handler is pure orchestration.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::response::{IntoResponse, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextLinkKind, IssueWorkspaceContextSnapshot,
    MemoryCursor, MemoryEntry, MemoryEntryId, MemoryPage,
};
use superkick_integrations::linear::{LinearClient, LinearError};
use superkick_storage::repo::{IssueWorkspaceContextRepoDyn, MemoryEntryRepoDyn};

use crate::error::AppError;

/// Page-size guardrails for the memory listing endpoint. The default matches
/// the UI's `useIssueMemoryEntries` page hint; the cap keeps a single page
/// from materialising too much text at once.
const DEFAULT_MEMORY_LIMIT: u32 = 50;
const MAX_MEMORY_LIMIT: u32 = 200;

/// State shared by the three issue-context handlers. Held as `Arc` so the
/// production `AppState` and the test router can build it from different
/// concrete types without cloning the repos.
#[derive(Clone)]
pub struct IssueContextState {
    pub context_repo: Arc<dyn IssueWorkspaceContextRepoDyn>,
    pub memory_repo: Arc<dyn MemoryEntryRepoDyn>,
    pub issue_lookup: Option<Arc<dyn IssueLookup>>,
}

impl FromRef<crate::AppState> for IssueContextState {
    fn from_ref(state: &crate::AppState) -> Self {
        let issue_lookup = state
            .linear_client
            .as_ref()
            .map(|client| Arc::clone(client) as Arc<dyn IssueLookup>);
        Self {
            context_repo: Arc::clone(&state.issue_workspace_context_repo)
                as Arc<dyn IssueWorkspaceContextRepoDyn>,
            memory_repo: Arc::clone(&state.memory_repo) as Arc<dyn MemoryEntryRepoDyn>,
            issue_lookup,
        }
    }
}

/// Thin object-safe abstraction over the Linear lookup used by
/// `ensure_context_for_issue`. The single method takes whatever the API
/// route received (a Linear UUID, or an identifier like `SUP-148`) and
/// returns the frozen snapshot we persist. Production: `LinearClient`.
/// Tests: a stub that returns a canned payload.
pub trait IssueLookup: Send + Sync {
    fn lookup<'a>(
        &'a self,
        id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<IssueWorkspaceContextSnapshot, LinearError>> + Send + 'a>>;
}

impl IssueLookup for LinearClient {
    fn lookup<'a>(
        &'a self,
        id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<IssueWorkspaceContextSnapshot, LinearError>> + Send + 'a>>
    {
        Box::pin(async move {
            let detail = self.get_issue(id).await?;
            let team_key = detail
                .identifier
                .split_once('-')
                .map(|(team, _)| team.to_string())
                .unwrap_or_else(|| detail.identifier.clone());
            Ok(IssueWorkspaceContextSnapshot {
                linear_team_key: team_key,
                linear_issue_identifier: detail.identifier,
                linear_issue_id: detail.id,
                snapshot_title: detail.title,
                snapshot_body_md: detail.description,
                snapshot_status_name: detail.status.name,
            })
        })
    }
}

// ── Wire DTOs ─────────────────────────────────────────────────────────

/// Wire form of `IssueWorkspaceContext`. We flatten the snapshot fields and
/// drop the internal columns (`memory_ledger_pointer`, `created_at`,
/// `updated_at`) that the client has no use for.
#[derive(Debug, Serialize)]
pub struct IssueWorkspaceContextWire {
    pub snapshot: IssueSnapshotWire,
    pub comment_excerpts: Vec<CommentExcerptWire>,
    pub linked_items: Vec<LinkedItemWire>,
}

#[derive(Debug, Serialize)]
pub struct IssueSnapshotWire {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: String,
    pub status_name: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CommentExcerptWire {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub text: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct LinkedItemWire {
    pub kind: IssueWorkspaceContextLinkKind,
    pub id: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MemoryEntryWire {
    pub id: MemoryEntryId,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MemoryEntriesPageWire {
    pub entries: Vec<MemoryEntryWire>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MemoryListQuery {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AppendMemoryBody {
    pub role: String,
    #[serde(default)]
    pub author: Option<String>,
    pub text: String,
}

// ── Handlers ──────────────────────────────────────────────────────────

pub async fn get_or_create_context(
    State(state): State<IssueContextState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let context = ensure_context_for_issue(&state, &id).await?;
    Ok(Json(load_context_wire(&state, context).await?))
}

pub async fn list_memory(
    State(state): State<IssueContextState>,
    Path(id): Path<String>,
    Query(params): Query<MemoryListQuery>,
) -> Result<impl IntoResponse, AppError> {
    let context = ensure_context_for_issue(&state, &id).await?;
    let limit = params
        .limit
        .unwrap_or(DEFAULT_MEMORY_LIMIT)
        .clamp(1, MAX_MEMORY_LIMIT);
    let cursor = params
        .cursor
        .as_deref()
        .map(MemoryCursor::from_opaque)
        .transpose()?;
    let page = state
        .memory_repo
        .list_page(context.id, cursor, limit)
        .await?;
    Ok(Json(memory_page_to_wire(page)))
}

pub async fn append_memory(
    State(state): State<IssueContextState>,
    Path(id): Path<String>,
    Json(body): Json<AppendMemoryBody>,
) -> Result<impl IntoResponse, AppError> {
    let context = ensure_context_for_issue(&state, &id).await?;
    let entry = MemoryEntry::new(context.id, body.role, body.author, body.text)?;
    state.memory_repo.append(&entry).await?;
    Ok(Json(memory_entry_to_wire(entry)))
}

// ── Helpers ───────────────────────────────────────────────────────────

async fn ensure_context_for_issue(
    state: &IssueContextState,
    id: &str,
) -> Result<IssueWorkspaceContext, AppError> {
    // Snapshot is frozen-at-attach (see `IssueSnapshot` doc) -- if a context
    // already exists for this :id we serve it without round-tripping to
    // Linear. The URL :id can be either the identifier (`SUP-148`) or the
    // Linear UUID, so we probe both indexes before falling back.
    if let Some(existing) = state
        .context_repo
        .list_by_issue_identifier(id)
        .await?
        .into_iter()
        .next()
    {
        return Ok(existing);
    }
    if let Some(existing) = state
        .context_repo
        .find_latest_by_linear_issue_id(id)
        .await?
    {
        return Ok(existing);
    }

    // First attach for this issue -- resolve from Linear and persist. The
    // post-lookup find-by-UUID guards against a concurrent attach that hit
    // the API with a different :id form (identifier vs. UUID) between our DB
    // probes and the lookup return.
    let lookup = state
        .issue_lookup
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;
    let snapshot = lookup.lookup(id).await?;
    if let Some(existing) = state
        .context_repo
        .find_latest_by_linear_issue_id(&snapshot.linear_issue_id)
        .await?
    {
        return Ok(existing);
    }
    let (context, excerpts, links) = IssueWorkspaceContext::new(snapshot, Vec::new(), Vec::new())?;
    state
        .context_repo
        .insert_with_children(&context, &excerpts, &links)
        .await?;
    Ok(context)
}

async fn load_context_wire(
    state: &IssueContextState,
    context: IssueWorkspaceContext,
) -> Result<IssueWorkspaceContextWire, AppError> {
    let excerpts = state.context_repo.list_excerpts(context.id).await?;
    let links = state.context_repo.list_links(context.id).await?;
    Ok(IssueWorkspaceContextWire {
        snapshot: IssueSnapshotWire {
            id: context.linear_issue_id,
            identifier: context.linear_issue_identifier,
            title: context.snapshot_title,
            description: context.snapshot_body_md,
            status_name: context.snapshot_status_name,
            captured_at: context.captured_at,
        },
        comment_excerpts: excerpts
            .into_iter()
            .map(|e| CommentExcerptWire {
                id: e.id.0.to_string(),
                author: e.author,
                text: e.body_md,
                captured_at: e.captured_at,
            })
            .collect(),
        linked_items: links
            .into_iter()
            .map(|l| LinkedItemWire {
                kind: l.link_kind,
                id: l.target_id,
                captured_at: l.attached_at,
            })
            .collect(),
    })
}

fn memory_entry_to_wire(entry: MemoryEntry) -> MemoryEntryWire {
    MemoryEntryWire {
        id: entry.id,
        role: entry.role,
        author: entry.author,
        text: entry.text,
        created_at: entry.created_at,
    }
}

fn memory_page_to_wire(page: MemoryPage) -> MemoryEntriesPageWire {
    MemoryEntriesPageWire {
        next_cursor: page.next_cursor.as_ref().map(MemoryCursor::to_opaque),
        entries: page.entries.into_iter().map(memory_entry_to_wire).collect(),
    }
}
