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

/// Keep the last `max` characters, with no marker. Tail-keeping is for text
/// whose decision-bearing content sits at the end (agent summaries).
pub(crate) fn tail_chars(text: &str, max: usize) -> String {
    let total = text.chars().count();
    if total <= max {
        return text.to_string();
    }
    text.chars().skip(total - max).collect()
}

/// Keep the last `max` characters, prepending `…` when shortened.
pub(crate) fn tail_chars_ellipsized(text: &str, max: usize) -> String {
    let total = text.chars().count();
    if total <= max {
        return text.to_string();
    }
    let mut out = String::from("…");
    out.extend(text.chars().skip(total - max));
    out
}
