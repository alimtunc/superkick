use std::any::type_name;

use anyhow::{Context, Result};

pub fn serialize_enum<T: serde::Serialize>(value: &T) -> Result<String> {
    let encoded = serde_json::to_string(value)
        .with_context(|| format!("failed to serialize {}", type_name::<T>()))?;
    Ok(encoded.trim_matches('"').to_string())
}

pub fn deserialize_enum<T: serde::de::DeserializeOwned>(value: &str) -> Result<T> {
    let quoted = format!("\"{value}\"");
    serde_json::from_str(&quoted)
        .with_context(|| format!("failed to deserialize {} from `{value}`", type_name::<T>()))
}
