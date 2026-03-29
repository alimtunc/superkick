//! Linear GraphQL client for issue list and detail queries.
//!
//! Sends GraphQL requests to `https://api.linear.app/graphql`.
//! No local caching — Linear remains the source of truth.

use anyhow::{Context, bail};

use super::types::{
    GqlDetailResponse, GqlResponse, IssueDetailResponse, IssueListResponse, LinearIssueListItem,
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
      parent { id identifier title }
      children {
        nodes {
          id identifier title updatedAt
          state { type name color }
          priority priorityLabel
          labels { nodes { name color } }
          assignee { name avatarUrl }
        }
      }
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
    parent { id identifier title }
    children {
      nodes {
        id identifier title updatedAt
        state { type name color }
        priority priorityLabel
        labels { nodes { name color } }
        assignee { name avatarUrl }
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
    pub async fn list_issues(&self, limit: u32) -> anyhow::Result<IssueListResponse> {
        let page_size = limit.min(50);
        let mut all_issues: Vec<LinearIssueListItem> = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let remaining = limit.saturating_sub(all_issues.len() as u32);
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

            let resp = self
                .http
                .post(LINEAR_API_URL)
                .header("Authorization", &self.api_key)
                .json(&body)
                .send()
                .await
                .context("failed to reach Linear API")?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp
                    .text()
                    .await
                    .context("failed to read Linear API error body")?;
                bail!("Linear API returned {status}: {text}");
            }

            let gql: GqlResponse = resp
                .json()
                .await
                .context("failed to parse Linear GraphQL response")?;

            if let Some(errors) = gql.errors {
                let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
                bail!("Linear GraphQL errors: {}", msgs.join("; "));
            }

            let data = gql.data.context("Linear response contained no data")?;
            let issues = data.issues;
            let has_next = issues.page_info.has_next_page;
            cursor = issues.page_info.end_cursor;

            all_issues.extend(issues.nodes.into_iter().map(LinearIssueListItem::from));

            if !has_next {
                break;
            }
        }

        let total_count = all_issues.len() as u32;
        Ok(IssueListResponse {
            issues: all_issues,
            total_count,
        })
    }

    /// Fetch a single issue by its Linear UUID.
    ///
    /// Returns the full detail payload including description, comments,
    /// and metadata. The `linked_runs` field is left empty — the API
    /// layer populates it from superkick-storage.
    pub async fn get_issue(&self, id: &str) -> anyhow::Result<IssueDetailResponse> {
        let body = serde_json::json!({
            "query": ISSUE_DETAIL_QUERY,
            "variables": { "id": id }
        });

        let resp = self
            .http
            .post(LINEAR_API_URL)
            .header("Authorization", &self.api_key)
            .json(&body)
            .send()
            .await
            .context("failed to reach Linear API")?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp
                .text()
                .await
                .context("failed to read Linear API error body")?;
            bail!("Linear API returned {status}: {text}");
        }

        let gql: GqlDetailResponse = resp
            .json()
            .await
            .context("failed to parse Linear GraphQL detail response")?;

        if let Some(errors) = gql.errors {
            let msgs: Vec<_> = errors.iter().map(|e| e.message.as_str()).collect();
            bail!("Linear GraphQL errors: {}", msgs.join("; "));
        }

        let data = gql.data.context("Linear response contained no data")?;
        Ok(IssueDetailResponse::from(data.issue))
    }
}
