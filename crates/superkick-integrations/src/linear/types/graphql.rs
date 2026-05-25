//! Internal deserialization types matching the Linear GraphQL response shape.

use chrono::{DateTime, Utc};
use serde::Deserialize;

// ── Issue list response ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlResponse {
    pub data: Option<GqlData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlError {
    pub message: String,
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

#[derive(Debug, Deserialize)]
pub(crate) struct GqlViewerResponse {
    pub data: Option<GqlViewerData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlViewerData {
    pub viewer: GqlUser,
}

// ── Issue detail response ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlDetailResponse {
    pub data: Option<GqlDetailData>,
    pub errors: Option<Vec<GqlError>>,
}

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
    pub children: Option<GqlChildConnection>,
    #[serde(default)]
    pub inverse_relations: Option<GqlInverseRelationConnection>,
    pub comments: GqlCommentConnection,
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

#[derive(Debug, Deserialize)]
pub(crate) struct GqlSearchResponse {
    pub data: Option<GqlSearchData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlSearchData {
    pub search_issues: GqlIssueConnection,
}

// ── Recent comments response ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentsResponse {
    pub data: Option<GqlCommentsData>,
    pub errors: Option<Vec<GqlError>>,
}

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

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTeamStatesResponse {
    pub data: Option<GqlTeamStatesData>,
    pub errors: Option<Vec<GqlError>>,
}

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
    pub position: f64,
}

// ── Issue team lookup (cold-cache fallback for update_issue_state) ───

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueTeamResponse {
    pub data: Option<GqlIssueTeamData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueTeamData {
    pub issue: Option<GqlIssueTeam>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueTeam {
    pub team: GqlTeamRef,
}

// ── issueUpdate mutation response ────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueUpdateResponse {
    pub data: Option<GqlIssueUpdateData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueUpdateData {
    pub issue_update: GqlIssueUpdate,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueUpdate {
    pub success: bool,
}
