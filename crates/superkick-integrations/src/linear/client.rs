//! Linear GraphQL client for issue list queries.
//!
//! Sends a single GraphQL request to `https://api.linear.app/graphql`,
//! fetching issues filtered by team, sorted by `updatedAt` descending.
//! No local caching — Linear remains the source of truth.

use anyhow::{Context, bail};

use super::types::{GqlResponse, IssueListResponse, LinearIssueListItem};

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";

const ISSUES_QUERY: &str = r#"
query ListIssues($first: Int!, $after: String) {
  issues(
    filter: {
      state: { type: { in: ["started", "unstarted"] } }
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
      state { name color }
      priority
      priorityLabel
      labels { nodes { name color } }
      assignee { name avatarUrl }
    }
    pageInfo { hasNextPage endCursor }
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
    /// Returns up to `limit` issues (default 50), sorted by `updatedAt` desc.
    /// Statuses included: `started` (In Progress) and `unstarted` (Todo/Backlog).
    pub async fn list_issues(&self, limit: u32) -> anyhow::Result<IssueListResponse> {
        let body = serde_json::json!({
            "query": ISSUES_QUERY,
            "variables": {
                "first": limit,
                "after": serde_json::Value::Null,
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
        let total_count = data.issues.nodes.len() as u32;
        let issues: Vec<LinearIssueListItem> = data
            .issues
            .nodes
            .into_iter()
            .map(LinearIssueListItem::from)
            .collect();

        Ok(IssueListResponse {
            issues,
            total_count,
        })
    }
}
