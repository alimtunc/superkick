use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}

define_id!(RunId);
define_id!(StepId);
define_id!(EventId);
define_id!(AgentSessionId);
define_id!(InterruptId);
define_id!(ArtifactId);
define_id!(PullRequestId);
define_id!(TranscriptChunkId);
define_id!(AttentionRequestId);
define_id!(HandoffId);
define_id!(OwnershipEventId);
define_id!(SessionLifecycleEventId);
define_id!(RuntimeId);
define_id!(RuntimeProviderId);
define_id!(OrchestratorSessionId);
define_id!(OrchestratorCheckpointId);
define_id!(ConversationId);
define_id!(TurnId);
define_id!(TurnEventId);
define_id!(TakeoverSessionId);
define_id!(LaunchTaskId);
define_id!(LaunchTaskStepId);
define_id!(IssueWorkspaceContextId);
define_id!(IssueWorkspaceContextCommentExcerptId);
define_id!(IssueWorkspaceContextLinkId);
