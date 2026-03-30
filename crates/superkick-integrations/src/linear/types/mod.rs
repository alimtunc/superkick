//! Normalized types for the Linear issue list and detail contracts.
//!
//! These types represent the **stable API payload** that the frontend relies on.
//! They are intentionally decoupled from Linear's raw GraphQL schema so that
//! upstream changes don't ripple into the UI contract.

mod contract;
mod convert;
pub(crate) mod graphql;

pub use contract::*;
pub(crate) use graphql::{GqlDetailResponse, GqlResponse};

#[cfg(test)]
mod tests;
