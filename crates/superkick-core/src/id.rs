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
