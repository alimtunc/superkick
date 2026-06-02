//! Small string helpers shared across runtime services.

/// Truncate `text` to at most `max` characters, appending an ellipsis when it
/// was cut. Operates on `char` boundaries so multi-byte input never panics.
pub(crate) fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() > max {
        format!("{}…", text.chars().take(max).collect::<String>())
    } else {
        text.to_string()
    }
}
