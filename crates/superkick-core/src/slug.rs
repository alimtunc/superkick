//! Shared slug validation for app-managed entity ids/names.
//!
//! Skill ids and agent names are both stable string slugs used as DB primary
//! keys and (for skills) interpolated into worktree paths, so both must reject
//! `/`, `.`, `..`, whitespace, and uppercase before any value reaches the
//! filesystem or a catalog key.

/// `true` when `id` matches `^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$`: lowercase
/// alphanumerics with interior hyphens/underscores only (the builtin
/// `pre_pr_review` uses underscores, `codex-plan` uses hyphens).
pub fn is_safe_slug(id: &str) -> bool {
    let edges_alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    let Some(first) = id.bytes().next() else {
        return false;
    };
    let Some(last) = id.bytes().last() else {
        return false;
    };
    edges_alnum(first)
        && edges_alnum(last)
        && id.bytes().all(|b| edges_alnum(b) || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::is_safe_slug;

    #[test]
    fn accepts_valid_slugs() {
        for ok in ["a", "a1", "codex-plan", "pre_pr_review", "my-agent_2"] {
            assert!(is_safe_slug(ok), "expected `{ok}` accepted");
        }
    }

    #[test]
    fn rejects_bad_slugs() {
        for bad in [
            "", "-x", "x-", "_x", "x_", "Bad", "a/b", "..", " sp", "a b", "café",
        ] {
            assert!(!is_safe_slug(bad), "expected `{bad}` rejected");
        }
    }
}
