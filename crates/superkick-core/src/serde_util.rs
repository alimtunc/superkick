//! Crate-internal serde helpers shared across domain modules.

use std::time::Duration;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub(crate) const fn default_true() -> bool {
    true
}

/// `Duration` ⇄ integer milliseconds.
pub(crate) mod duration_millis {
    use super::*;

    pub fn serialize<S: Serializer>(d: &Duration, s: S) -> Result<S::Ok, S::Error> {
        (d.as_millis() as u64).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Duration, D::Error> {
        let raw = u64::deserialize(d)?;
        Ok(Duration::from_millis(raw))
    }
}

/// `Option<Duration>` ⇄ optional integer milliseconds.
pub(crate) mod duration_millis_opt {
    use super::*;

    pub fn serialize<S: Serializer>(d: &Option<Duration>, s: S) -> Result<S::Ok, S::Error> {
        d.map(|d| d.as_millis() as u64).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Duration>, D::Error> {
        let raw = Option::<u64>::deserialize(d)?;
        Ok(raw.map(Duration::from_millis))
    }
}
