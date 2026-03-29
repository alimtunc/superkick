//! Linear API integration — issue querying and response normalization.

mod client;
mod types;

pub use client::LinearClient;
pub use types::{
    IssueAssignee, IssueComment, IssueCycle, IssueDetailResponse, IssueLabel, IssueListResponse,
    IssuePriority, IssueProject, IssueStatus, LinearIssueListItem,
};
