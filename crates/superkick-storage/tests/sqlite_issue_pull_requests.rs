use anyhow::Result;
use chrono::Utc;
use superkick_core::{
    IssuePullRequest, IssuePullRequestSource, PrDiffFile, PrDiffFileStatus, PrState,
};
use superkick_storage::repo::IssuePullRequestRepo;
use superkick_storage::{SqliteIssuePullRequestRepo, connect_with_capacity};

async fn setup() -> Result<SqliteIssuePullRequestRepo> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    Ok(SqliteIssuePullRequestRepo::new(pool))
}

fn issue_pr(number: u32, state: PrState) -> IssuePullRequest {
    let now = Utc::now();
    IssuePullRequest {
        issue_id: "issue-uuid".into(),
        issue_identifier: "SUP-222".into(),
        repo_slug: "acme/superkick".into(),
        number,
        url: format!("https://github.com/acme/superkick/pull/{number}"),
        state,
        title: format!("SUP-222 PR #{number}"),
        head_branch: format!("codex/sup-222-{number}"),
        head_sha: format!("head-sha-{number}"),
        base_branch: "main".into(),
        source: IssuePullRequestSource::LinearAttachment,
        created_at: now,
        updated_at: now,
        merged_at: None,
        synced_at: now,
    }
}

#[tokio::test]
async fn issue_pull_requests_upsert_and_list_without_runs() -> Result<()> {
    let repo = setup().await?;

    let mut pr = issue_pr(42, PrState::Draft);
    repo.upsert_issue_pr(&pr).await?;
    pr.state = PrState::Open;
    pr.title = "SUP-222 ready for review".into();
    repo.upsert_issue_pr(&pr).await?;

    let listed = repo.list_by_issue("SUP-222").await?;

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].number, 42);
    assert_eq!(listed[0].state, PrState::Open);
    assert_eq!(listed[0].title, "SUP-222 ready for review");

    Ok(())
}

#[tokio::test]
async fn pr_diff_files_are_cached_by_head_sha() -> Result<()> {
    let repo = setup().await?;
    let pr = issue_pr(42, PrState::Open);
    repo.upsert_issue_pr(&pr).await?;

    repo.replace_diff_files(
        "SUP-222",
        "acme/superkick",
        42,
        "head-sha-42",
        &[PrDiffFile {
            path: "ui/src/App.tsx".into(),
            old_path: None,
            status: PrDiffFileStatus::Modified,
            additions: 12,
            deletions: 4,
            patch: Some("@@ -1 +1 @@\n-old\n+new".into()),
            position: 0,
        }],
    )
    .await?;

    let cached = repo
        .list_diff_files("SUP-222", "acme/superkick", 42, "head-sha-42")
        .await?;
    let stale = repo
        .list_diff_files("SUP-222", "acme/superkick", 42, "new-head")
        .await?;

    assert_eq!(cached.len(), 1);
    assert_eq!(cached[0].path, "ui/src/App.tsx");
    assert!(stale.is_empty());

    Ok(())
}
