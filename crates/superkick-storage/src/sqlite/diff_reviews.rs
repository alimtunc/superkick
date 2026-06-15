//! SUP-199 — SQLite-backed local diff review repository.

use anyhow::{Context, Result, bail};
use chrono::Utc;
use sqlx::SqlitePool;
use superkick_core::{
    DiffReviewAnchor, DiffReviewComment, DiffReviewCommentId, DiffReviewFileReviewedChange,
    DiffReviewFileState, DiffReviewLineSide, DiffReviewState, DiffReviewSubject, DiffReviewThread,
    DiffReviewThreadId, DiffReviewThreadState, NewDiffReviewComment, NewDiffReviewThread, RunId,
    normalize_diff_review_comment_body,
};

use super::codec::{decode_rfc3339, deserialize_enum, serialize_enum};
use crate::repo::DiffReviewRepo;

pub struct SqliteDiffReviewRepo {
    pool: SqlitePool,
}

impl SqliteDiffReviewRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl DiffReviewRepo for SqliteDiffReviewRepo {
    async fn list_by_subject(&self, subject: DiffReviewSubject) -> Result<DiffReviewState> {
        let subject_type = subject.subject_type();
        let subject_id = subject.storage_key();

        let thread_rows = sqlx::query_as::<_, ThreadRow>(
            "SELECT * FROM diff_review_threads WHERE subject_type = ?1 AND subject_id = ?2 \
             ORDER BY file_path ASC, created_at ASC, id ASC",
        )
        .bind(subject_type)
        .bind(&subject_id)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list diff_review_threads for subject {subject_id}"))?;

        let mut threads = Vec::with_capacity(thread_rows.len());
        for row in thread_rows {
            threads.push(self.thread_from_row(row).await?);
        }

        let reviewed_rows = sqlx::query_as::<_, FileStateRow>(
            "SELECT * FROM diff_review_file_states WHERE subject_type = ?1 AND subject_id = ?2 \
             ORDER BY file_path ASC",
        )
        .bind(subject_type)
        .bind(&subject_id)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list diff_review_file_states for subject {subject_id}"))?;
        let reviewed_files = reviewed_rows
            .into_iter()
            .map(FileStateRow::into_domain)
            .collect::<Result<Vec<_>>>()?;

        Ok(DiffReviewState::new(subject, threads, reviewed_files))
    }

    async fn get_thread(&self, thread_id: DiffReviewThreadId) -> Result<Option<DiffReviewThread>> {
        let row = sqlx::query_as::<_, ThreadRow>(
            "SELECT * FROM diff_review_threads WHERE id = ?1 LIMIT 1",
        )
        .bind(thread_id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get diff_review_thread {}", thread_id.0))?;
        match row {
            Some(row) => Ok(Some(self.thread_from_row(row).await?)),
            None => Ok(None),
        }
    }

    async fn create_thread(&self, new: NewDiffReviewThread) -> Result<DiffReviewThread> {
        let thread = DiffReviewThread::new(new)?;
        let first_comment = thread
            .comments
            .first()
            .expect("new diff_review_thread has a first comment");

        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin create diff_review_thread tx")?;
        let subject = SubjectColumns::from(&thread.anchor.subject);
        sqlx::query(
            "INSERT INTO diff_review_threads (\
                 id, subject_type, subject_id, run_id, subject_repo_slug, subject_pr_number, \
                 subject_head_sha, issue_id, file_path, old_path, side, old_line, old_line_end, \
                 new_line, new_line_end, hunk_header, hunk_index, base_ref, head_ref, state, \
                 author, created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, \
                 ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
        )
        .bind(thread.id.0.to_string())
        .bind(subject.subject_type)
        .bind(&subject.subject_id)
        .bind(subject.run_id.clone())
        .bind(subject.repo_slug.clone())
        .bind(subject.pr_number)
        .bind(subject.head_sha.clone())
        .bind(thread.anchor.issue_id.clone())
        .bind(&thread.anchor.file_path)
        .bind(thread.anchor.old_path.clone())
        .bind(serialize_enum(&thread.anchor.side)?)
        .bind(thread.anchor.old_line.map(i64::from))
        .bind(thread.anchor.old_line_end.map(i64::from))
        .bind(thread.anchor.new_line.map(i64::from))
        .bind(thread.anchor.new_line_end.map(i64::from))
        .bind(thread.anchor.hunk_header.clone())
        .bind(thread.anchor.hunk_index.map(i64::from))
        .bind(thread.anchor.base_ref.clone())
        .bind(thread.anchor.head_ref.clone())
        .bind(serialize_enum(&thread.state)?)
        .bind(&thread.author)
        .bind(thread.created_at.to_rfc3339())
        .bind(thread.updated_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .with_context(|| format!("insert diff_review_thread {}", thread.id.0))?;

        insert_comment(&mut tx, first_comment).await?;
        tx.commit()
            .await
            .context("commit create diff_review_thread tx")?;
        Ok(thread)
    }

    async fn add_comment(
        &self,
        thread_id: DiffReviewThreadId,
        new: NewDiffReviewComment,
    ) -> Result<DiffReviewComment> {
        let comment = DiffReviewComment::new(thread_id, new)?;
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin add diff_review_comment tx")?;
        insert_comment(&mut tx, &comment).await?;
        sqlx::query("UPDATE diff_review_threads SET updated_at = ?1 WHERE id = ?2")
            .bind(comment.updated_at.to_rfc3339())
            .bind(thread_id.0.to_string())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("touch diff_review_thread {}", thread_id.0))?;
        tx.commit()
            .await
            .context("commit add diff_review_comment tx")?;
        Ok(comment)
    }

    async fn update_comment(
        &self,
        comment_id: DiffReviewCommentId,
        body: String,
    ) -> Result<Option<DiffReviewComment>> {
        let body = normalize_diff_review_comment_body(&body)?;
        let now = Utc::now().to_rfc3339();
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin update diff_review_comment tx")?;
        let thread_id: Option<String> =
            sqlx::query_scalar("SELECT thread_id FROM diff_review_comments WHERE id = ?1 LIMIT 1")
                .bind(comment_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .with_context(|| format!("find thread for diff_review_comment {}", comment_id.0))?;
        let Some(thread_id) = thread_id else {
            tx.commit()
                .await
                .context("commit missing diff_review_comment tx")?;
            return Ok(None);
        };
        sqlx::query("UPDATE diff_review_comments SET body = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(body)
            .bind(&now)
            .bind(comment_id.0.to_string())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("update diff_review_comment {}", comment_id.0))?;
        sqlx::query("UPDATE diff_review_threads SET updated_at = ?1 WHERE id = ?2")
            .bind(&now)
            .bind(&thread_id)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("touch diff_review_thread {thread_id}"))?;
        tx.commit()
            .await
            .context("commit update diff_review_comment tx")?;
        self.get_comment(comment_id).await
    }

    async fn delete_comment(&self, comment_id: DiffReviewCommentId) -> Result<bool> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin delete diff_review_comment tx")?;
        let row = sqlx::query_as::<_, CommentThreadRow>(
            "SELECT c.thread_id, \
                    (SELECT COUNT(*) FROM diff_review_comments WHERE thread_id = c.thread_id) AS comment_count \
             FROM diff_review_comments c \
             WHERE c.id = ?1 \
             LIMIT 1",
        )
        .bind(comment_id.0.to_string())
        .fetch_optional(&mut *tx)
        .await
        .with_context(|| format!("find diff_review_comment {}", comment_id.0))?;
        let Some(row) = row else {
            tx.commit()
                .await
                .context("commit missing diff_review_comment delete tx")?;
            return Ok(false);
        };

        if row.comment_count <= 1 {
            sqlx::query("DELETE FROM diff_review_threads WHERE id = ?1")
                .bind(&row.thread_id)
                .execute(&mut *tx)
                .await
                .with_context(|| {
                    format!("delete last-comment diff_review_thread {}", row.thread_id)
                })?;
        } else {
            sqlx::query("DELETE FROM diff_review_comments WHERE id = ?1")
                .bind(comment_id.0.to_string())
                .execute(&mut *tx)
                .await
                .with_context(|| format!("delete diff_review_comment {}", comment_id.0))?;
            sqlx::query("UPDATE diff_review_threads SET updated_at = ?1 WHERE id = ?2")
                .bind(Utc::now().to_rfc3339())
                .bind(&row.thread_id)
                .execute(&mut *tx)
                .await
                .with_context(|| format!("touch diff_review_thread {}", row.thread_id))?;
        }
        tx.commit()
            .await
            .context("commit delete diff_review_comment tx")?;
        Ok(true)
    }

    async fn set_thread_resolved(
        &self,
        thread_id: DiffReviewThreadId,
        resolved: bool,
    ) -> Result<Option<DiffReviewThread>> {
        let state = if resolved {
            DiffReviewThreadState::Resolved
        } else {
            DiffReviewThreadState::Open
        };
        let now = Utc::now().to_rfc3339();
        let result =
            sqlx::query("UPDATE diff_review_threads SET state = ?1, updated_at = ?2 WHERE id = ?3")
                .bind(serialize_enum(&state)?)
                .bind(now)
                .bind(thread_id.0.to_string())
                .execute(&self.pool)
                .await
                .with_context(|| {
                    format!("set diff_review_thread {} resolved={resolved}", thread_id.0)
                })?;
        if result.rows_affected() == 0 {
            return Ok(None);
        }
        self.get_thread(thread_id).await
    }

    async fn delete_thread(&self, thread_id: DiffReviewThreadId) -> Result<bool> {
        let result = sqlx::query("DELETE FROM diff_review_threads WHERE id = ?1")
            .bind(thread_id.0.to_string())
            .execute(&self.pool)
            .await
            .with_context(|| format!("delete diff_review_thread {}", thread_id.0))?;
        Ok(result.rows_affected() == 1)
    }

    async fn set_file_reviewed(
        &self,
        change: DiffReviewFileReviewedChange,
    ) -> Result<DiffReviewFileState> {
        let state = DiffReviewFileState::from_change(change)?;
        let subject = SubjectColumns::from(&state.subject);
        sqlx::query(
            "INSERT INTO diff_review_file_states (\
                 subject_type, subject_id, run_id, subject_repo_slug, subject_pr_number, \
                 subject_head_sha, issue_id, file_path, old_path, reviewed, reviewer, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)\
             ON CONFLICT(subject_id, file_path) DO UPDATE SET \
                 subject_type = excluded.subject_type, \
                 run_id = excluded.run_id, \
                 subject_repo_slug = excluded.subject_repo_slug, \
                 subject_pr_number = excluded.subject_pr_number, \
                 subject_head_sha = excluded.subject_head_sha, \
                 issue_id = excluded.issue_id, \
                 old_path = excluded.old_path, \
                 reviewed = excluded.reviewed, \
                 reviewer = excluded.reviewer, \
                 updated_at = excluded.updated_at",
        )
        .bind(subject.subject_type)
        .bind(&subject.subject_id)
        .bind(subject.run_id.clone())
        .bind(subject.repo_slug.clone())
        .bind(subject.pr_number)
        .bind(subject.head_sha.clone())
        .bind(state.issue_id.clone())
        .bind(&state.file_path)
        .bind(state.old_path.clone())
        .bind(i64::from(state.reviewed))
        .bind(state.reviewer.clone())
        .bind(state.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| {
            format!(
                "upsert diff_review_file_state {} {}",
                subject.subject_id, state.file_path
            )
        })?;
        Ok(state)
    }
}

impl SqliteDiffReviewRepo {
    async fn thread_from_row(&self, row: ThreadRow) -> Result<DiffReviewThread> {
        let id = DiffReviewThreadId(uuid::Uuid::parse_str(&row.id)?);
        let comments = self.list_comments(id).await?;
        row.into_domain(comments)
    }

    async fn list_comments(&self, thread_id: DiffReviewThreadId) -> Result<Vec<DiffReviewComment>> {
        let rows = sqlx::query_as::<_, CommentRow>(
            "SELECT * FROM diff_review_comments WHERE thread_id = ?1 ORDER BY created_at ASC, id ASC",
        )
        .bind(thread_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list diff_review_comments for thread {}", thread_id.0))?;
        rows.into_iter().map(CommentRow::into_domain).collect()
    }

    async fn get_comment(
        &self,
        comment_id: DiffReviewCommentId,
    ) -> Result<Option<DiffReviewComment>> {
        let row = sqlx::query_as::<_, CommentRow>(
            "SELECT * FROM diff_review_comments WHERE id = ?1 LIMIT 1",
        )
        .bind(comment_id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get diff_review_comment {}", comment_id.0))?;
        row.map(CommentRow::into_domain).transpose()
    }
}

async fn insert_comment(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    comment: &DiffReviewComment,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO diff_review_comments \
         (id, thread_id, author, body, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(comment.id.0.to_string())
    .bind(comment.thread_id.0.to_string())
    .bind(&comment.author)
    .bind(&comment.body)
    .bind(comment.created_at.to_rfc3339())
    .bind(comment.updated_at.to_rfc3339())
    .execute(&mut **tx)
    .await
    .with_context(|| format!("insert diff_review_comment {}", comment.id.0))?;
    Ok(())
}

struct SubjectColumns {
    subject_type: &'static str,
    subject_id: String,
    run_id: Option<String>,
    repo_slug: Option<String>,
    pr_number: Option<i64>,
    head_sha: Option<String>,
}

impl From<&DiffReviewSubject> for SubjectColumns {
    fn from(subject: &DiffReviewSubject) -> Self {
        Self {
            subject_type: subject.subject_type(),
            subject_id: subject.storage_key(),
            run_id: subject.run_id().map(|run_id| run_id.0.to_string()),
            repo_slug: subject.repo_slug().map(str::to_string),
            pr_number: subject.pr_number().map(i64::from),
            head_sha: subject.head_sha().map(str::to_string),
        }
    }
}

fn subject_from_parts(
    subject_type: &str,
    run_id: Option<String>,
    repo_slug: Option<String>,
    pr_number: Option<i64>,
    head_sha: Option<String>,
) -> Result<DiffReviewSubject> {
    match subject_type {
        "run" => {
            let run_id = run_id.context("run diff review row missing run_id")?;
            Ok(DiffReviewSubject::run(RunId(uuid::Uuid::parse_str(
                &run_id,
            )?)))
        }
        "pull_request" => {
            let repo_slug = repo_slug.context("pr diff review row missing repo_slug")?;
            let number = pr_number.context("pr diff review row missing pr_number")?;
            Ok(DiffReviewSubject::pull_request(
                repo_slug,
                u32::try_from(number)?,
                head_sha.unwrap_or_default(),
            ))
        }
        other => bail!("unknown diff review subject_type {other}"),
    }
}

#[derive(sqlx::FromRow)]
struct ThreadRow {
    id: String,
    subject_type: String,
    run_id: Option<String>,
    subject_repo_slug: Option<String>,
    subject_pr_number: Option<i64>,
    subject_head_sha: Option<String>,
    issue_id: Option<String>,
    file_path: String,
    old_path: Option<String>,
    side: String,
    old_line: Option<i64>,
    old_line_end: Option<i64>,
    new_line: Option<i64>,
    new_line_end: Option<i64>,
    hunk_header: Option<String>,
    hunk_index: Option<i64>,
    base_ref: Option<String>,
    head_ref: Option<String>,
    state: String,
    author: String,
    created_at: String,
    updated_at: String,
}

impl ThreadRow {
    fn into_domain(self, comments: Vec<DiffReviewComment>) -> Result<DiffReviewThread> {
        let subject = subject_from_parts(
            &self.subject_type,
            self.run_id,
            self.subject_repo_slug,
            self.subject_pr_number,
            self.subject_head_sha,
        )?;
        Ok(DiffReviewThread {
            id: DiffReviewThreadId(uuid::Uuid::parse_str(&self.id)?),
            anchor: DiffReviewAnchor {
                subject,
                issue_id: self.issue_id,
                file_path: self.file_path,
                old_path: self.old_path,
                side: deserialize_enum::<DiffReviewLineSide>(&self.side)?,
                old_line: self.old_line.map(u32::try_from).transpose()?,
                old_line_end: self.old_line_end.map(u32::try_from).transpose()?,
                new_line: self.new_line.map(u32::try_from).transpose()?,
                new_line_end: self.new_line_end.map(u32::try_from).transpose()?,
                hunk_header: self.hunk_header,
                hunk_index: self.hunk_index.map(u32::try_from).transpose()?,
                base_ref: self.base_ref,
                head_ref: self.head_ref,
            },
            state: deserialize_enum::<DiffReviewThreadState>(&self.state)?,
            author: self.author,
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
            comments,
        })
    }
}

#[derive(sqlx::FromRow)]
struct CommentRow {
    id: String,
    thread_id: String,
    author: String,
    body: String,
    created_at: String,
    updated_at: String,
}

impl CommentRow {
    fn into_domain(self) -> Result<DiffReviewComment> {
        Ok(DiffReviewComment {
            id: DiffReviewCommentId(uuid::Uuid::parse_str(&self.id)?),
            thread_id: DiffReviewThreadId(uuid::Uuid::parse_str(&self.thread_id)?),
            author: self.author,
            body: self.body,
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
        })
    }
}

#[derive(sqlx::FromRow)]
struct CommentThreadRow {
    thread_id: String,
    comment_count: i64,
}

#[derive(sqlx::FromRow)]
struct FileStateRow {
    subject_type: String,
    run_id: Option<String>,
    subject_repo_slug: Option<String>,
    subject_pr_number: Option<i64>,
    subject_head_sha: Option<String>,
    issue_id: Option<String>,
    file_path: String,
    old_path: Option<String>,
    reviewed: i64,
    reviewer: Option<String>,
    updated_at: String,
}

impl FileStateRow {
    fn into_domain(self) -> Result<DiffReviewFileState> {
        let subject = subject_from_parts(
            &self.subject_type,
            self.run_id,
            self.subject_repo_slug,
            self.subject_pr_number,
            self.subject_head_sha,
        )?;
        Ok(DiffReviewFileState {
            subject,
            issue_id: self.issue_id,
            file_path: self.file_path,
            old_path: self.old_path,
            reviewed: self.reviewed != 0,
            reviewer: self.reviewer,
            updated_at: decode_rfc3339(&self.updated_at)?,
        })
    }
}
