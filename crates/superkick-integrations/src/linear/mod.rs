//! Linear API integration — issue querying and response normalization.

mod client;
mod context;
mod error;
mod types;

pub use client::LinearClient;
pub use context::issue_context_from_detail;
pub use error::LinearError;
pub use types::{
    CachedComment, IssueAssignee, IssueAttachment, IssueBlockerRef, IssueChildRef, IssueComment,
    IssueCreateInput, IssueCycle, IssueDetailResponse, IssueLabel, IssueListResponse,
    IssueParentRef, IssuePriority, IssueProject, IssueStateMutation, IssueStatus, IssueUpdateInput,
    LabelOption, LinearIssueListItem, LinearOptions, ProjectOption, TeamOption, UserOption,
    ViewerResponse, WorkflowStateOption,
};
