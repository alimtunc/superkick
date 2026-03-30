/// Parse a GitHub remote URL into an `owner/repo` slug.
///
/// Supports SSH (`git@github.com:owner/repo.git`) and HTTPS
/// (`https://github.com/owner/repo.git`) formats.
pub fn parse_repo_slug(url: &str) -> Option<String> {
    let url = url.trim();

    // SSH: git@github.com:owner/repo.git
    if let Some(path) = url.strip_prefix("git@github.com:") {
        let slug = path.strip_suffix(".git").unwrap_or(path);
        if slug.contains('/') && !slug.starts_with('/') {
            return Some(slug.to_string());
        }
    }

    // HTTPS: https://github.com/owner/repo.git
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        let slug = rest.strip_suffix(".git").unwrap_or(rest);
        let slug = slug.trim_end_matches('/');
        if slug.contains('/') && slug.matches('/').count() == 1 {
            return Some(slug.to_string());
        }
    }

    None
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
}
