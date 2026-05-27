//! Linear GraphQL client for issue list and detail queries.
//!
//! Sends GraphQL requests to `https://api.linear.app/graphql`.
//! No local caching — Linear remains the source of truth.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{DateTime, Duration as ChronoDuration, Utc};

use super::error::LinearError;
use super::types::{
    CachedComment, GqlCommentCreateResponse, GqlCommentsResponse, GqlDetailResponse,
    GqlIssueCreateResponse, GqlIssueUpdateResponse, GqlOptionsResponse, GqlRecentComment,
    GqlResponse, GqlSearchResponse, GqlTeamStatesResponse, GqlViewerResponse, IssueComment,
    IssueCreateInput, IssueDetailResponse, IssueListResponse, IssueStateMutation, IssueUpdateInput,
    LinearIssueListItem, LinearOptions, ViewerResponse, WorkflowStateOption,
    classify_graphql_errors,
};

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

const VIEWER_QUERY: &str = r#"
query Viewer {
  viewer {
    id
    name
    avatarUrl
  }
}
"#;

/// 5 min — catches subsequent drops in a session while letting admins propagate state renames in a sane window.
const WORKFLOW_STATE_TTL: Duration = Duration::from_secs(5 * 60);

const ISSUES_QUERY: &str = r#"
query ListIssues($first: Int!, $after: String) {
  issues(
    filter: {
      state: { type: { in: ["started", "unstarted", "completed", "backlog"] } }
    }
    first: $first
    after: $after
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      url
      createdAt
      updatedAt
      completedAt
      state { type name color }
      team { id }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { id name avatarUrl }
      project { name }
      parent { id identifier title state { type name color } }
      children {
        nodes {
          id identifier title updatedAt
          state { type name color }
          priority priorityLabel
          labels { nodes { name color } }
          assignee { id name avatarUrl }
        }
      }
      inverseRelations(first: 50) {
        nodes {
          type
          issue { id identifier title state { type name color } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"#;

const ISSUE_SEARCH_QUERY: &str = r#"
query SearchIssues($term: String!, $first: Int!) {
  searchIssues(term: $term, first: $first, orderBy: updatedAt) {
    nodes {
      id
      identifier
      title
      url
      createdAt
      updatedAt
      completedAt
      state { type name color }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { id name avatarUrl }
      project { name }
      parent { id identifier title state { type name color } }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"#;

const ISSUE_TEAM_QUERY: &str = r#"
query IssueTeam($id: String!) {
  issue(id: $id) {
    team { id }
  }
}
"#;

const RECENT_COMMENTS_QUERY: &str = r#"
query RecentComments($first: Int!, $after: String, $since: DateTimeOrDuration!) {
  comments(
    filter: { createdAt: { gte: $since } }
    first: $first
    after: $after
    orderBy: createdAt
  ) {
    nodes {
      id
      body
      createdAt
      user { id name avatarUrl }
      issue { id identifier }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"#;

const TEAM_STATES_QUERY: &str = r#"
query TeamStates($teamId: String!) {
  team(id: $teamId) {
    states {
      nodes { id type name color position }
    }
  }
}
"#;

/// Selection set for a fully hydrated issue. Shared by both write mutations
/// and any future query that returns a `GqlIssueDetail`.
macro_rules! issue_detail_selection {
    () => {
        r#"
      id
      identifier
      title
      description
      url
      createdAt
      updatedAt
      state { type name color }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { id name avatarUrl }
      project { name }
      cycle { name number }
      estimate
      dueDate
      parent { id identifier title state { type name color } }
      children {
        nodes {
          id identifier title updatedAt
          state { type name color }
          priority priorityLabel
          labels { nodes { name color } }
          assignee { id name avatarUrl }
        }
      }
      inverseRelations {
        nodes {
          type
          issue { id identifier title state { type name color } }
        }
      }
      comments(first: 50, orderBy: createdAt) {
        nodes {
          id
          body
          user { id name avatarUrl }
          createdAt
          updatedAt
          parent { id }
          children { nodes {
            id
            body
            user { id name avatarUrl }
            createdAt
            updatedAt
          } }
        }
      }
        "#
    };
}

const ISSUE_UPDATE_STATE_ONLY_MUTATION: &str = r#"
mutation UpdateIssueState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
  }
}
"#;

const ISSUE_UPDATE_MUTATION: &str = concat!(
    "mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {",
    "  issueUpdate(id: $id, input: $input) {",
    "    success",
    "    issue {",
    issue_detail_selection!(),
    "    }",
    "  }",
    "}",
);

const ISSUE_CREATE_MUTATION: &str = concat!(
    "mutation CreateIssue($input: IssueCreateInput!) {",
    "  issueCreate(input: $input) {",
    "    success",
    "    issue {",
    issue_detail_selection!(),
    "    }",
    "  }",
    "}",
);

const COMMENT_CREATE_MUTATION: &str = r#"
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment {
      id
      body
      user { id name avatarUrl }
      createdAt
      updatedAt
      parent { id }
    }
  }
}
"#;

const LINEAR_OPTIONS_QUERY: &str = r#"
query LinearOptions($first: Int!) {
  teams(first: $first) {
    nodes {
      id
      key
      name
      states { nodes { id type name color position } }
    }
  }
  users(first: $first, filter: { active: { eq: true } }) {
    nodes { id name avatarUrl }
  }
  projects(first: $first) {
    nodes { id name color state }
  }
  issueLabels(first: $first) {
    nodes { id name color team { id } }
  }
}
"#;

const ISSUE_DETAIL_QUERY: &str = r#"
query GetIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    url
    createdAt
    updatedAt
    state { type name color }
    priority
    priorityLabel
    labels { nodes { name color } }
    assignee { id name avatarUrl }
    project { name }
    cycle { name number }
    estimate
    dueDate
    parent { id identifier title state { type name color } }
    team { id }
    children {
      nodes {
        id identifier title updatedAt
        state { type name color }
        priority priorityLabel
        labels { nodes { name color } }
        assignee { id name avatarUrl }
      }
    }
    inverseRelations {
      nodes {
        type
        issue { id identifier title state { type name color } }
      }
    }
    comments(first: 50, orderBy: createdAt) {
      nodes {
        id
        body
        user { id name avatarUrl }
        createdAt
        updatedAt
        parent { id }
        children { nodes {
          id
          body
          user { id name avatarUrl }
          createdAt
          updatedAt
        } }
      }
    }
  }
}
"#;

#[derive(Debug, Clone)]
struct TeamWorkflowStates {
    states: Vec<WorkflowState>,
    fetched_at: Instant,
}

#[derive(Debug, Clone)]
struct WorkflowState {
    id: String,
    state_type: String,
    name: String,
    color: String,
    /// Linear's user-defined ordering. Teams can have multiple workflow states of the
    /// same `type` (e.g. "In Progress" and "In Review" both `started`); position
    /// disambiguates so `started` resolves to the leftmost lane the user expects.
    position: f64,
}

/// Thin HTTP client for the Linear GraphQL API.
#[derive(Clone)]
pub struct LinearClient {
    http: reqwest::Client,
    api_key: String,
    workflow_state_cache: std::sync::Arc<Mutex<HashMap<String, TeamWorkflowStates>>>,
}

impl LinearClient {
    pub fn new(api_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_key,
            workflow_state_cache: std::sync::Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Fetch the issue list for the authenticated user's workspace.
    ///
    /// Paginates through Linear's GraphQL API using cursor-based pagination,
    /// fetching up to `limit` issues total. Sorted by `updatedAt` desc.
    /// Statuses included: `started`, `unstarted`, `completed`, `backlog`.
    pub async fn list_issues(&self, limit: u32) -> Result<IssueListResponse, LinearError> {
        let page_size = limit.min(50);
        let mut all_issues: Vec<LinearIssueListItem> = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let fetched = u32::try_from(all_issues.len()).unwrap_or(u32::MAX);
            let remaining = limit.saturating_sub(fetched);
            if remaining == 0 {
                break;
            }
            let fetch_count = remaining.min(page_size);

            let body = serde_json::json!({
                "query": ISSUES_QUERY,
                "variables": {
                    "first": fetch_count,
                    "after": cursor,
                }
            });

            let gql: GqlResponse = self.post(&body).await?;

            if let Some(errors) = gql.errors {
                let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                return Err(LinearError::Graphql(msgs.join("; ")));
            }

            let data = gql.data.ok_or(LinearError::NoData)?;
            let issues = data.issues;
            let has_next = issues.page_info.has_next_page;
            cursor = issues.page_info.end_cursor;

            all_issues.extend(issues.nodes.into_iter().map(LinearIssueListItem::from));

            if !has_next {
                break;
            }
        }

        let total_count = u32::try_from(all_issues.len()).unwrap_or(u32::MAX);
        Ok(IssueListResponse {
            issues: all_issues,
            total_count,
        })
    }

    /// Search issues by Linear's `searchIssues` field (id / title / body /
    /// labels). Linear's ranking is opaque — V1 accepts the default. Returns
    /// at most `limit` results in a single round trip.
    pub async fn search_issues(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<IssueListResponse, LinearError> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(IssueListResponse {
                issues: Vec::new(),
                total_count: 0,
            });
        }

        let first = limit.clamp(1, 50);
        let body = serde_json::json!({
            "query": ISSUE_SEARCH_QUERY,
            "variables": {
                "term": trimmed,
                "first": first,
            }
        });

        let gql: GqlSearchResponse = self.post(&body).await?;

        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(LinearError::Graphql(msgs.join("; ")));
        }

        let data = gql.data.ok_or(LinearError::NoData)?;
        let issues: Vec<LinearIssueListItem> = data
            .search_issues
            .nodes
            .into_iter()
            .map(LinearIssueListItem::from)
            .collect();
        let total_count = u32::try_from(issues.len()).unwrap_or(u32::MAX);

        Ok(IssueListResponse {
            issues,
            total_count,
        })
    }

    /// Fetch every comment created in the last `window_days` days, capped at
    /// `max_entries` total. Used to seed the in-memory comment cache that the
    /// `/search` handler filters by substring per query. Paginates internally.
    pub async fn recent_comments(
        &self,
        window_days: u32,
        max_entries: u32,
    ) -> Result<Vec<CachedComment>, LinearError> {
        let since: DateTime<Utc> = Utc::now() - ChronoDuration::days(i64::from(window_days));
        let since_str = since.to_rfc3339();
        let page_size: u32 = 100;
        let mut out: Vec<CachedComment> = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let fetched = u32::try_from(out.len()).unwrap_or(u32::MAX);
            let remaining = max_entries.saturating_sub(fetched);
            if remaining == 0 {
                break;
            }
            let fetch_count = remaining.min(page_size);

            let body = serde_json::json!({
                "query": RECENT_COMMENTS_QUERY,
                "variables": {
                    "first": fetch_count,
                    "after": cursor,
                    "since": since_str,
                }
            });

            let gql: GqlCommentsResponse = self.post(&body).await?;
            if let Some(errors) = gql.errors {
                let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                return Err(LinearError::Graphql(msgs.join("; ")));
            }

            let data = gql.data.ok_or(LinearError::NoData)?;
            let has_next = data.comments.page_info.has_next_page;
            cursor = data.comments.page_info.end_cursor;

            out.extend(data.comments.nodes.into_iter().map(cached_comment_from_gql));

            if !has_next {
                break;
            }
        }

        Ok(out)
    }

    /// Fetch a single issue by its Linear UUID.
    ///
    /// Returns the full detail payload including description, comments,
    /// and metadata. The `linked_runs` field is left empty — the API
    /// layer populates it from superkick-storage.
    pub async fn get_issue(&self, id: &str) -> Result<IssueDetailResponse, LinearError> {
        let body = serde_json::json!({
            "query": ISSUE_DETAIL_QUERY,
            "variables": { "id": id }
        });

        let gql: GqlDetailResponse = self.post(&body).await?;

        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(LinearError::Graphql(msgs.join("; ")));
        }

        let data = gql.data.ok_or(LinearError::NoData)?;
        Ok(IssueDetailResponse::from(data.issue))
    }

    /// Identify the authenticated Linear user. Returns the viewer's stable
    /// `id`, `name`, and avatar — the frontend uses `id` to compute
    /// "assigned to me" without name collisions.
    pub async fn viewer(&self) -> Result<ViewerResponse, LinearError> {
        let body = serde_json::json!({ "query": VIEWER_QUERY });
        let gql: GqlViewerResponse = self.post(&body).await?;

        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(LinearError::Graphql(msgs.join("; ")));
        }

        let user = gql.data.ok_or(LinearError::NoData)?.viewer;
        Ok(ViewerResponse {
            id: user.id,
            name: user.name,
            avatar_url: user.avatar_url,
        })
    }

    /// Kanban drop path: slim state-only mutation, response discarded.
    pub async fn update_issue_state(
        &self,
        issue_id: &str,
        team_id: Option<&str>,
        mutation: IssueStateMutation,
    ) -> Result<(), LinearError> {
        let state_id = self
            .resolve_workflow_state_for_type(team_id, mutation.linear_state_type(), Some(issue_id))
            .await?;
        let body = serde_json::json!({
            "query": ISSUE_UPDATE_STATE_ONLY_MUTATION,
            "variables": { "id": issue_id, "stateId": state_id }
        });
        let gql: GqlIssueUpdateResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            return Err(classify_graphql_errors(&errors));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        if !data.issue_update.success {
            return Err(LinearError::Rejected(
                "Linear refused the status update (issueUpdate returned success=false)".into(),
            ));
        }
        Ok(())
    }

    /// Apply a full `IssueUpdateInput` to an existing issue. Returns the
    /// hydrated detail so the API layer can respond without a follow-up `GET`.
    pub async fn update_issue(
        &self,
        issue_id: &str,
        input: IssueUpdateInput,
    ) -> Result<IssueDetailResponse, LinearError> {
        let body = serde_json::json!({
            "query": ISSUE_UPDATE_MUTATION,
            "variables": { "id": issue_id, "input": input }
        });
        let gql: GqlIssueUpdateResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            return Err(classify_graphql_errors(&errors));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        if !data.issue_update.success {
            return Err(LinearError::Rejected(
                "Linear refused the update (issueUpdate returned success=false)".into(),
            ));
        }
        let issue = data
            .issue_update
            .issue
            .ok_or_else(|| LinearError::InvalidResponse("issueUpdate.issue was null".into()))?;
        Ok(IssueDetailResponse::from(issue))
    }

    /// Create a new issue from `input`. Returns the hydrated detail so the
    /// API layer can respond with `201 Created + body` and the UI can prime
    /// its cache without a follow-up `GET`.
    pub async fn create_issue(
        &self,
        input: IssueCreateInput,
    ) -> Result<IssueDetailResponse, LinearError> {
        let body = serde_json::json!({
            "query": ISSUE_CREATE_MUTATION,
            "variables": { "input": input }
        });
        let gql: GqlIssueCreateResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            return Err(classify_graphql_errors(&errors));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        if !data.issue_create.success {
            return Err(LinearError::Rejected(
                "Linear refused the create (issueCreate returned success=false)".into(),
            ));
        }
        let issue = data
            .issue_create
            .issue
            .ok_or_else(|| LinearError::InvalidResponse("issueCreate.issue was null".into()))?;
        Ok(IssueDetailResponse::from(issue))
    }

    /// Post a top-level comment on `issue_id`. Returns the persisted comment
    /// in the same shape `IssueDetailResponse.comments` carries.
    pub async fn create_comment(
        &self,
        issue_id: &str,
        body: &str,
    ) -> Result<IssueComment, LinearError> {
        let payload = serde_json::json!({
            "query": COMMENT_CREATE_MUTATION,
            "variables": { "issueId": issue_id, "body": body }
        });
        let gql: GqlCommentCreateResponse = self.post(&payload).await?;
        if let Some(errors) = gql.errors {
            return Err(classify_graphql_errors(&errors));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        if !data.comment_create.success {
            return Err(LinearError::Rejected(
                "Linear refused the comment (commentCreate returned success=false)".into(),
            ));
        }
        let comment = data
            .comment_create
            .comment
            .ok_or_else(|| LinearError::InvalidResponse("commentCreate.comment was null".into()))?;
        Ok(IssueComment::from(comment))
    }

    /// Fetch the picker metadata for the workspace in a single round-trip:
    /// teams (with their workflow states), active users, projects, and
    /// labels. Capped at 250 per resource — the UI surfaces a truncated
    /// flag when the cap is reached and switches to server-side search.
    pub async fn list_options(&self) -> Result<LinearOptions, LinearError> {
        let body = serde_json::json!({
            "query": LINEAR_OPTIONS_QUERY,
            "variables": { "first": 250 }
        });
        let gql: GqlOptionsResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            return Err(classify_graphql_errors(&errors));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        // Warm the workflow-state cache from the same payload so a follow-up
        // `update_issue_state` for any returned team skips the team-states
        // round-trip.
        for team in &data.teams.nodes {
            let states: Vec<WorkflowState> = team
                .states
                .nodes
                .iter()
                .map(|s| WorkflowState {
                    id: s.id.clone(),
                    state_type: s.state_type.clone(),
                    name: s.name.clone(),
                    color: s.color.clone(),
                    position: s.position,
                })
                .collect();
            self.put_team_states(team.id.clone(), states);
        }
        Ok(LinearOptions::from(data))
    }

    /// Resolve the workflow-state UUID for `target_type` on the supplied
    /// team. When `team_id` is `None`, looks it up from `issue_id` (the
    /// kanban code path that came in with the URL `:id` but no body
    /// `team_id`).
    pub async fn resolve_workflow_state_for_type(
        &self,
        team_id: Option<&str>,
        target_type: &str,
        issue_id_for_lookup: Option<&str>,
    ) -> Result<String, LinearError> {
        let team_id = match team_id {
            Some(id) => id.to_string(),
            None => {
                let issue_id = issue_id_for_lookup.ok_or_else(|| {
                    LinearError::Rejected(
                        "team_id is required to resolve a workflow state without an issue_id"
                            .into(),
                    )
                })?;
                self.fetch_issue_team_id(issue_id).await?
            }
        };
        self.resolve_workflow_state_id(&team_id, target_type).await
    }

    /// Read the workflow states for `team_id`, returning the picker-ready
    /// option shape (name + color + position + type). Warm-reads the cache,
    /// fetches on miss. Used by handlers that need to translate a
    /// workflow-state lane the UI selected by id back into a display label.
    pub async fn list_workflow_states_for_team(
        &self,
        team_id: &str,
    ) -> Result<Vec<WorkflowStateOption>, LinearError> {
        let states = match self.cached_team_states(team_id) {
            Some(states) => states,
            None => {
                let fetched = self.fetch_team_states(team_id).await?;
                self.put_team_states(team_id.to_string(), fetched.clone());
                fetched
            }
        };
        Ok(states
            .into_iter()
            .map(|s| WorkflowStateOption {
                id: s.id,
                name: s.name,
                state_type: s.state_type,
                color: s.color,
                position: s.position,
            })
            .collect())
    }

    async fn fetch_issue_team_id(&self, issue_id: &str) -> Result<String, LinearError> {
        let body = serde_json::json!({
            "query": ISSUE_TEAM_QUERY,
            "variables": { "id": issue_id }
        });
        let gql: super::types::GqlIssueTeamResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(LinearError::Graphql(msgs.join("; ")));
        }
        gql.data
            .and_then(|d| d.issue.map(|i| i.team.id))
            .ok_or(LinearError::NoData)
    }

    async fn resolve_workflow_state_id(
        &self,
        team_id: &str,
        target_type: &str,
    ) -> Result<String, LinearError> {
        if let Some(states) = self.cached_team_states(team_id) {
            if let Some(id) = first_state_id(&states, target_type) {
                return Ok(id);
            }
        }

        let states = self.fetch_team_states(team_id).await?;
        self.put_team_states(team_id.to_string(), states.clone());
        first_state_id(&states, target_type).ok_or_else(|| {
            LinearError::Rejected(format!(
                "Linear team {team_id} has no workflow state of type {target_type}"
            ))
        })
    }

    fn cached_team_states(&self, team_id: &str) -> Option<Vec<WorkflowState>> {
        let cache = self
            .workflow_state_cache
            .lock()
            .expect("bug: workflow state cache poisoned");
        let entry = cache.get(team_id)?;
        if entry.fetched_at.elapsed() < WORKFLOW_STATE_TTL {
            Some(entry.states.clone())
        } else {
            None
        }
    }

    fn put_team_states(&self, team_id: String, states: Vec<WorkflowState>) {
        let mut cache = self
            .workflow_state_cache
            .lock()
            .expect("bug: workflow state cache poisoned");
        cache.insert(
            team_id,
            TeamWorkflowStates {
                states,
                fetched_at: Instant::now(),
            },
        );
    }

    async fn fetch_team_states(&self, team_id: &str) -> Result<Vec<WorkflowState>, LinearError> {
        let body = serde_json::json!({
            "query": TEAM_STATES_QUERY,
            "variables": { "teamId": team_id }
        });
        let gql: GqlTeamStatesResponse = self.post(&body).await?;
        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            return Err(LinearError::Graphql(msgs.join("; ")));
        }
        let data = gql.data.ok_or(LinearError::NoData)?;
        let team = data
            .team
            .ok_or_else(|| LinearError::Rejected(format!("Linear team {team_id} not found")))?;
        Ok(team
            .states
            .nodes
            .into_iter()
            .map(|s| WorkflowState {
                id: s.id,
                state_type: s.state_type,
                name: s.name,
                color: s.color,
                position: s.position,
            })
            .collect())
    }

    /// Shared POST helper. Classifies HTTP failures, surfaces Linear's
    /// response body verbatim in `Status` for operator-visible errors, and
    /// normalises parse failures into `InvalidResponse`.
    async fn post<T: serde::de::DeserializeOwned>(
        &self,
        body: &serde_json::Value,
    ) -> Result<T, LinearError> {
        let resp = self
            .http
            .post(LINEAR_API_URL)
            .header("Authorization", &self.api_key)
            .json(body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp
                .text()
                .await
                .unwrap_or_else(|e| format!("<failed to read error body: {e}>"));
            return Err(LinearError::Status { status, body });
        }

        resp.json::<T>()
            .await
            .map_err(|e| LinearError::InvalidResponse(e.to_string()))
    }
}

fn cached_comment_from_gql(node: GqlRecentComment) -> CachedComment {
    CachedComment {
        id: node.id,
        issue_id: node.issue.id,
        issue_identifier: node.issue.identifier,
        body: node.body,
        author_name: node.user.map(|u| u.name),
        created_at: node.created_at,
    }
}

/// Resolve to the *leftmost* workflow state of the given type — Linear teams can
/// have multiple lanes of the same `type` (e.g. "In Progress" and "In Review"
/// are both `started`), and `position` is Linear's user-defined ordering, so
/// the lowest position is what the operator sees first on the kanban.
fn first_state_id(states: &[WorkflowState], target_type: &str) -> Option<String> {
    states
        .iter()
        .filter(|s| s.state_type == target_type)
        .min_by(|a, b| {
            a.position
                .partial_cmp(&b.position)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|s| s.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(id: &str, ty: &str, position: f64) -> WorkflowState {
        WorkflowState {
            id: id.to_string(),
            state_type: ty.to_string(),
            name: String::new(),
            color: String::new(),
            position,
        }
    }

    #[test]
    fn first_state_id_picks_lowest_position_when_type_has_duplicates() {
        let states = vec![
            state("in-review-id", "started", 1002.0),
            state("in-progress-id", "started", 2.0),
            state("done-id", "completed", 3.0),
        ];
        assert_eq!(
            first_state_id(&states, "started").as_deref(),
            Some("in-progress-id"),
        );
    }

    #[test]
    fn first_state_id_returns_none_when_no_match() {
        let states = vec![state("backlog-id", "backlog", 0.0)];
        assert_eq!(first_state_id(&states, "started"), None);
    }
}
