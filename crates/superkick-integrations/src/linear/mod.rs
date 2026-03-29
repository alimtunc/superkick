//! Linear API integration — issue querying and response normalization.

mod client;
mod types;

pub use client::LinearClient;
pub use types::{
    IssueAssignee, IssueChildRef, IssueComment, IssueCycle, IssueDetailResponse, IssueLabel,
    IssueListResponse, IssueParentRef, IssuePriority, IssueProject, IssueStatus,
    LinearIssueListItem,
};
