//! Curated, static per-provider model catalog.
//!
//! The Claude and Codex CLIs expose no "list models" command, so Superkick
//! ships a curated list server-side (the same approach Multica takes) and the
//! frontend offers a free-text "Custom…" fallback for anything not listed.
//! This is reference data, not a live vendor call — CLI-driven enrichment is a
//! later iteration.

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;

/// One selectable model for a provider. `is_default` marks the entry the
/// composer/editor preselects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}

/// The curated model list for a provider, default first.
#[must_use]
pub fn provider_models(provider: AgentProvider) -> Vec<ModelInfo> {
    match provider {
        AgentProvider::Codex => vec![
            model("gpt-5-codex", "GPT-5 Codex", true),
            model("gpt-5", "GPT-5", false),
            model("o4-mini", "o4-mini", false),
        ],
        AgentProvider::Claude => vec![
            model("claude-opus-4-8", "Claude Opus 4.8", true),
            model("claude-sonnet-4-6", "Claude Sonnet 4.6", false),
            model("claude-haiku-4-5", "Claude Haiku 4.5", false),
        ],
    }
}

fn model(id: &str, label: &str, is_default: bool) -> ModelInfo {
    ModelInfo {
        id: id.into(),
        label: label.into(),
        is_default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_provider_has_exactly_one_default() {
        for provider in [AgentProvider::Codex, AgentProvider::Claude] {
            let models = provider_models(provider);
            assert!(!models.is_empty(), "{provider} has models");
            assert_eq!(
                models.iter().filter(|m| m.is_default).count(),
                1,
                "{provider} has exactly one default model"
            );
        }
    }
}
