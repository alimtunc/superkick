//! Internal deserialization types matching the Linear GraphQL response shape.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer};

use super::super::error::LinearError;

/// Linear's `priority` is wire-typed `Float` but ranges over the integer scale
/// 0..=4; accept the Float shape (matching the history path's `Option<f32>`) and
/// round into the domain `u8`, collapsing out-of-range to `0` ("No priority").
fn deserialize_priority<'de, D>(deserializer: D) -> Result<u8, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = f64::deserialize(deserializer)?;
    if !raw.is_finite() {
        return Ok(0);
    }
    let rounded = raw.round();
    if !(0.0..=4.0).contains(&rounded) {
        return Ok(0);
    }
    Ok(rounded as u8)
}

/// Linear's top-level GraphQL response envelope: every query/mutation comes
/// back as `{ data, errors }`. `T` is the operation-specific `data` payload.
#[derive(Debug, Deserialize)]
pub(crate) struct GqlEnvelope<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GqlError>>,
}

// ── Issue list response ──────────────────────────────────────────────

pub(crate) type GqlResponse = GqlEnvelope<GqlData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlError {
    pub message: String,
    #[serde(default)]
    pub extensions: Option<GqlErrorExtensions>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlErrorExtensions {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub user_presentable_message: Option<String>,
}

/// Linear `extensions.code` values that map to operator-actionable
/// rejections — validation, missing permission, rate-limit. The HTTP layer
/// turns these into 422 with the verbatim `userPresentableMessage`;
/// everything else stays a generic `Graphql` (500) so we don't paper over
/// real bugs as user errors.
const REJECTABLE_GQL_CODES: &[&str] = &[
    "INVALID_INPUT",
    "FEATURE_NOT_ACCESSIBLE",
    "AUTHENTICATION_ERROR",
    "FORBIDDEN",
    "RATELIMITED",
];

/// Map a Linear GraphQL `errors[]` array onto the closest `LinearError`.
/// Used by every write path so the API's `LinearError → AppError` mapping
/// picks the right HTTP status without per-handler heuristics.
pub(crate) fn classify_graphql_errors(errors: &[GqlError]) -> LinearError {
    if let Some(err) = errors.iter().find(|e| {
        e.extensions
            .as_ref()
            .and_then(|x| x.code.as_deref())
            .is_some_and(|code| REJECTABLE_GQL_CODES.contains(&code))
    }) {
        let extensions = err
            .extensions
            .as_ref()
            .expect("REJECTABLE_GQL_CODES match guarantees extensions");
        let msg = extensions
            .user_presentable_message
            .clone()
            .unwrap_or_else(|| err.message.clone());
        return LinearError::Rejected(msg);
    }
    let joined = errors
        .iter()
        .map(|e| e.message.as_str())
        .collect::<Vec<_>>()
        .join("; ");
    LinearError::Graphql(joined)
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlData {
    pub issues: GqlIssueConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueConnection {
    pub nodes: Vec<GqlIssue>,
    pub page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlPageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    pub state: GqlIssueState,
    #[serde(default)]
    pub team: Option<GqlTeamRef>,
    #[serde(deserialize_with = "deserialize_priority")]
    pub priority: u8,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
    pub project: Option<GqlProject>,
    pub parent: Option<GqlIssueRef>,
    #[serde(default)]
    pub children: Option<GqlChildConnection>,
    /// Incoming relations — each node's `issue` is a candidate blocker when
    /// `type == "blocks"`. Optional so the query can be served from Linear
    /// tenants where the field is suppressed (we still want the issue itself).
    #[serde(default)]
    pub inverse_relations: Option<GqlInverseRelationConnection>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTeamRef {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlInverseRelationConnection {
    pub nodes: Vec<GqlInverseRelation>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlInverseRelation {
    #[serde(rename = "type")]
    pub relation_type: String,
    /// The subject of the relation — i.e. the *other* issue that has a
    /// relation pointing at this one. When `relation_type == "blocks"`, this
    /// issue is the blocker. Optional because Linear may hide the source
    /// issue when the operator lacks access to its team.
    pub issue: Option<GqlIssueRef>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueRef {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub state: GqlIssueState,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlChildConnection {
    pub nodes: Vec<GqlChildIssue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlChildIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub updated_at: DateTime<Utc>,
    pub state: GqlIssueState,
    #[serde(deserialize_with = "deserialize_priority")]
    pub priority: u8,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueState {
    #[serde(rename = "type")]
    pub state_type: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlLabelConnection {
    pub nodes: Vec<GqlLabel>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlUser {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

pub(crate) type GqlViewerResponse = GqlEnvelope<GqlViewerData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlViewerData {
    pub viewer: GqlUser,
}

// ── Issue detail response ────────────────────────────────────────────

pub(crate) type GqlDetailResponse = GqlEnvelope<GqlDetailData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlDetailData {
    pub issue: GqlIssueDetail,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueDetail {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub state: GqlIssueState,
    #[serde(deserialize_with = "deserialize_priority")]
    pub priority: u8,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
    pub project: Option<GqlProject>,
    pub cycle: Option<GqlCycle>,
    pub estimate: Option<f32>,
    pub due_date: Option<String>,
    pub parent: Option<GqlIssueRef>,
    #[serde(default)]
    pub team: Option<GqlTeamRef>,
    #[serde(default)]
    pub children: Option<GqlChildConnection>,
    #[serde(default)]
    pub inverse_relations: Option<GqlInverseRelationConnection>,
    pub comments: GqlCommentConnection,
    /// Optional so mutation responses keep deserializing if Linear ever
    /// omits the selection set, and so test fixtures don't have to model it.
    #[serde(default)]
    pub history: Option<GqlIssueHistoryConnection>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlProject {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCycle {
    pub name: Option<String>,
    pub number: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueHistoryConnection {
    pub nodes: Vec<GqlIssueHistory>,
    pub page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueHistory {
    pub id: String,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub actor: Option<GqlUser>,
    #[serde(default)]
    pub updated_description: Option<bool>,
    #[serde(default)]
    pub from_title: Option<String>,
    #[serde(default)]
    pub to_title: Option<String>,
    #[serde(default)]
    pub from_priority: Option<f32>,
    #[serde(default)]
    pub to_priority: Option<f32>,
    #[serde(default)]
    pub from_state: Option<GqlWorkflowStateRef>,
    #[serde(default)]
    pub to_state: Option<GqlWorkflowStateRef>,
    #[serde(default)]
    pub from_assignee: Option<GqlUser>,
    #[serde(default)]
    pub to_assignee: Option<GqlUser>,
    #[serde(default)]
    pub from_cycle: Option<GqlCycleRef>,
    #[serde(default)]
    pub to_cycle: Option<GqlCycleRef>,
    #[serde(default)]
    pub from_project: Option<GqlProjectRef>,
    #[serde(default)]
    pub to_project: Option<GqlProjectRef>,
    #[serde(default)]
    pub from_estimate: Option<f32>,
    #[serde(default)]
    pub to_estimate: Option<f32>,
    #[serde(default)]
    pub from_due_date: Option<String>,
    #[serde(default)]
    pub to_due_date: Option<String>,
    #[serde(default)]
    pub added_labels: Option<Vec<GqlHistoryLabel>>,
    #[serde(default)]
    pub removed_labels: Option<Vec<GqlHistoryLabel>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlWorkflowStateRef {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(rename = "type")]
    pub state_type: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCycleRef {
    pub id: String,
    pub name: Option<String>,
    pub number: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlProjectRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlHistoryLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentConnection {
    pub nodes: Vec<GqlComment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlComment {
    pub id: String,
    pub body: String,
    pub user: Option<GqlUser>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub parent: Option<GqlCommentRef>,
    #[serde(default)]
    pub children: Option<GqlCommentConnection>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentRef {
    pub id: String,
}

// ── Issue search response ────────────────────────────────────────────

pub(crate) type GqlSearchResponse = GqlEnvelope<GqlSearchData>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlSearchData {
    pub search_issues: GqlIssueConnection,
}

// ── Recent comments response ─────────────────────────────────────────

pub(crate) type GqlCommentsResponse = GqlEnvelope<GqlCommentsData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentsData {
    pub comments: GqlRecentCommentConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlRecentCommentConnection {
    pub nodes: Vec<GqlRecentComment>,
    pub page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlRecentComment {
    pub id: String,
    pub body: String,
    pub user: Option<GqlUser>,
    pub created_at: DateTime<Utc>,
    pub issue: GqlRecentCommentIssue,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlRecentCommentIssue {
    pub id: String,
    pub identifier: String,
}

// ── Team workflow states (drag-and-drop status mutation) ─────────────

pub(crate) type GqlTeamStatesResponse = GqlEnvelope<GqlTeamStatesData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTeamStatesData {
    pub team: Option<GqlTeamStates>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTeamStates {
    pub states: GqlWorkflowStateConnection,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlWorkflowStateConnection {
    pub nodes: Vec<GqlWorkflowState>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlWorkflowState {
    pub id: String,
    #[serde(rename = "type")]
    pub state_type: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub position: f64,
}

// ── Issue team lookup (cold-cache fallback for update_issue_state) ───

pub(crate) type GqlIssueTeamResponse = GqlEnvelope<GqlIssueTeamData>;

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueTeamData {
    pub issue: Option<GqlIssueTeam>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueTeam {
    pub team: GqlTeamRef,
}

// ── issueUpdate mutation response ────────────────────────────────────

pub(crate) type GqlIssueUpdateResponse = GqlEnvelope<GqlIssueUpdateData>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueUpdateData {
    pub issue_update: GqlIssueUpdate,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueUpdate {
    pub success: bool,
    /// Populated by the enriched mutation that returns the full issue detail;
    /// the legacy state-only mutation leaves this `None`.
    #[serde(default)]
    pub issue: Option<GqlIssueDetail>,
}

// ── issueCreate mutation response ────────────────────────────────────

pub(crate) type GqlIssueCreateResponse = GqlEnvelope<GqlIssueCreateData>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueCreateData {
    pub issue_create: GqlIssueCreate,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueCreate {
    pub success: bool,
    #[serde(default)]
    pub issue: Option<GqlIssueDetail>,
}

// ── commentCreate mutation response ──────────────────────────────────

pub(crate) type GqlCommentCreateResponse = GqlEnvelope<GqlCommentCreateData>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlCommentCreateData {
    pub comment_create: GqlCommentCreate,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentCreate {
    pub success: bool,
    #[serde(default)]
    pub comment: Option<GqlComment>,
}

// ── linearOptions composite query response ───────────────────────────

pub(crate) type GqlOptionsResponse = GqlEnvelope<GqlOptionsData>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlOptionsData {
    pub teams: GqlOptionsTeamConnection,
    pub users: GqlOptionsUserConnection,
    pub projects: GqlOptionsProjectConnection,
    pub issue_labels: GqlOptionsLabelConnection,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsTeamConnection {
    pub nodes: Vec<GqlOptionsTeam>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsTeam {
    pub id: String,
    pub key: String,
    pub name: String,
    pub states: GqlWorkflowStateConnection,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsUserConnection {
    pub nodes: Vec<GqlOptionsUser>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlOptionsUser {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsProjectConnection {
    pub nodes: Vec<GqlOptionsProject>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsProject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsLabelConnection {
    pub nodes: Vec<GqlOptionsLabel>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlOptionsLabel {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub team: Option<GqlTeamRef>,
}
