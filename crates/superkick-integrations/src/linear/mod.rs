//! Linear API integration — issue querying and response normalization.

mod client;
mod context;
mod types;

pub use client::LinearClient;
pub use context::issue_context_from_detail;
pub use types::{
    IssueAssignee, IssueChildRef, IssueComment, IssueCycle, IssueDetailResponse, IssueLabel,
    IssueListResponse, IssueParentRef, IssuePriority, IssueProject, IssueStatus,
    LinearIssueListItem,
};
