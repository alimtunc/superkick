//! Linear GraphQL client for issue list and detail queries.
//!
//! Sends GraphQL requests to `https://api.linear.app/graphql`.
//! No local caching — Linear remains the source of truth.

use chrono::{DateTime, Duration, Utc};

use super::error::LinearError;
use super::types::{
    CachedComment, GqlCommentsResponse, GqlDetailResponse, GqlRecentComment, GqlResponse,
    GqlSearchResponse, IssueDetailResponse, IssueListResponse, LinearIssueListItem,
};

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

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
      state { type name color }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { name avatarUrl }
      project { name }
      parent { id identifier title state { type name color } }
      children {
        nodes {
          id identifier title updatedAt
          state { type name color }
          priority priorityLabel
          labels { nodes { name color } }
          assignee { name avatarUrl }
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
query SearchIssues($query: String!, $first: Int!) {
  issueSearch(query: $query, first: $first, orderBy: updatedAt) {
    nodes {
      id
      identifier
      title
      url
      createdAt
      updatedAt
      state { type name color }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { name avatarUrl }
      project { name }
      parent { id identifier title state { type name color } }
    }
    pageInfo { hasNextPage endCursor }
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
      user { name avatarUrl }
      issue { id identifier }
    }
    pageInfo { hasNextPage endCursor }
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
    assignee { name avatarUrl }
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
        assignee { name avatarUrl }
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
        user { name avatarUrl }
        createdAt
        updatedAt
        parent { id }
        children { nodes {
          id
          body
          user { name avatarUrl }
          createdAt
          updatedAt
        } }
      }
    }
  }
}
"#;

/// Thin HTTP client for the Linear GraphQL API.
#[derive(Clone)]
pub struct LinearClient {
    http: reqwest::Client,
    api_key: String,
}

impl LinearClient {
    pub fn new(api_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_key,
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

    /// Search issues by Linear's `issueSearch` field (id / title / body /
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
                "query": trimmed,
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
            .issue_search
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
        let since: DateTime<Utc> = Utc::now() - Duration::days(i64::from(window_days));
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
