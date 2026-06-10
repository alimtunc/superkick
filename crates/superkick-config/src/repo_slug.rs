/// Parse a GitHub remote URL into an `owner/repo` slug.
///
/// Supports SSH (`git@github.com:owner/repo.git`) and HTTPS
/// (`https://github.com/owner/repo.git`) formats.
pub fn parse_repo_slug(url: &str) -> Option<String> {
    let url = url.trim();

    if let Some(path) = url.strip_prefix("git@github.com:") {
        return normalize_slug(path);
    }

    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        return normalize_slug(rest);
    }

    None
}

/// Strip `.git` / trailing slashes and require exactly `owner/repo` with
/// non-empty segments — both URL shapes funnel through the same rules.
fn normalize_slug(path: &str) -> Option<String> {
    let slug = path.strip_suffix(".git").unwrap_or(path);
    let slug = slug.trim_end_matches('/');
    let (owner, repo) = slug.split_once('/')?;
    if owner.is_empty() || repo.is_empty() || repo.contains('/') {
        return None;
    }
    Some(slug.to_string())
}

/// Read `git remote get-url origin` from the current directory and parse it
/// into an `owner/repo` slug. `None` when there is no git repo, no origin
/// remote, or the remote is not a recognised GitHub URL. Callers apply their
/// own error policy on top.
pub fn detect_repo_slug() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout);
    parse_repo_slug(url.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_with_git_suffix() {
        assert_eq!(
            parse_repo_slug("git@github.com:owner/repo.git"),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn ssh_without_git_suffix() {
        assert_eq!(
            parse_repo_slug("git@github.com:owner/repo"),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn https_with_git_suffix() {
        assert_eq!(
            parse_repo_slug("https://github.com/owner/repo.git"),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn https_without_git_suffix() {
        assert_eq!(
            parse_repo_slug("https://github.com/owner/repo"),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(
            parse_repo_slug("  git@github.com:owner/repo.git  "),
            Some("owner/repo".into())
        );
    }

    #[test]
    fn rejects_invalid_urls() {
        assert_eq!(parse_repo_slug("not-a-url"), None);
        assert_eq!(parse_repo_slug("https://gitlab.com/owner/repo"), None);
    }

    #[test]
    fn rejects_malformed_slugs_in_both_url_shapes() {
        assert_eq!(parse_repo_slug("git@github.com:a/b/c"), None);
        assert_eq!(
            parse_repo_slug("git@github.com:owner/repo/"),
            Some("owner/repo".into())
        );
        assert_eq!(parse_repo_slug("https://github.com//owner"), None);
        assert_eq!(parse_repo_slug("git@github.com:/owner"), None);
    }

    #[test]
    fn http_prefix_and_trailing_slash() {
        assert_eq!(
            parse_repo_slug("http://github.com/owner/repo"),
            Some("owner/repo".into())
        );
        assert_eq!(
            parse_repo_slug("https://github.com/owner/repo/"),
            Some("owner/repo".into())
        );
        assert_eq!(
            parse_repo_slug("http://github.com/owner/repo.git"),
            Some("owner/repo".into())
        );
    }
}
