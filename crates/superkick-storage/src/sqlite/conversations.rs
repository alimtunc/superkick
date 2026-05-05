//! SQLite repositories for structured chat conversations (SUP-100).

use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use superkick_core::{
    AgentProvider, Conversation, ConversationId, ConversationStatus, ConversationSubject,
    ProtocolEventEnvelope, RunId, Turn, TurnEvent, TurnEventId, TurnFailure, TurnId, TurnStatus,
    UsageSnapshot,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::{ConversationRepo, TurnEventRepo, TurnRepo};

pub struct SqliteConversationRepo {
    pool: SqlitePool,
}

impl SqliteConversationRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl ConversationRepo for SqliteConversationRepo {
    async fn create_or_get(
        &self,
        subject: &ConversationSubject,
        agent_id: &str,
        provider: AgentProvider,
        now: DateTime<Utc>,
    ) -> Result<Conversation> {
        // Idempotent on (subject, agent_id). We insert with ON CONFLICT DO
        // NOTHING; if a row already exists the SELECT below picks it up.
        // SQLite's ON CONFLICT can target a unique index — we have a partial
        // unique index per subject kind, so the conflict target depends on
        // the subject variant.
        let id = ConversationId::new();
        let (issue_identifier, run_id) = match subject {
            ConversationSubject::Issue { identifier } => (Some(identifier.clone()), None),
            ConversationSubject::Run { run_id } => (None, Some(run_id.0.to_string())),
        };

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO conversations (\
                 id, issue_identifier, run_id, agent_id, provider, status, \
                 provider_session_id, created_at, updated_at, last_turn_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7, NULL) \
             ON CONFLICT DO NOTHING",
        )
        .bind(id.0.to_string())
        .bind(&issue_identifier)
        .bind(&run_id)
        .bind(agent_id)
        .bind(serialize_enum(&provider)?)
        .bind(ConversationStatus::Active.to_string())
        .bind(now.to_rfc3339())
        .execute(&mut *tx)
        .await
        .context("insert conversation")?;

        let row = match (issue_identifier.as_deref(), run_id.as_deref()) {
            (Some(identifier), None) => sqlx::query_as::<_, ConversationRow>(
                "SELECT * FROM conversations WHERE issue_identifier = ?1 AND agent_id = ?2 LIMIT 1",
            )
            .bind(identifier)
            .bind(agent_id)
            .fetch_one(&mut *tx)
            .await
            .context("fetch conversation after upsert")?,
            (None, Some(rid)) => sqlx::query_as::<_, ConversationRow>(
                "SELECT * FROM conversations WHERE run_id = ?1 AND agent_id = ?2 LIMIT 1",
            )
            .bind(rid)
            .bind(agent_id)
            .fetch_one(&mut *tx)
            .await
            .context("fetch conversation after upsert")?,
            _ => return Err(anyhow!("conversation subject must be issue or run")),
        };

        tx.commit().await?;
        row.into_domain()
    }

    async fn get(&self, id: ConversationId) -> Result<Option<Conversation>> {
        let row = sqlx::query_as::<_, ConversationRow>(
            "SELECT * FROM conversations WHERE id = ?1 LIMIT 1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_subject(&self, subject: &ConversationSubject) -> Result<Vec<Conversation>> {
        let rows = match subject {
            ConversationSubject::Issue { identifier } => sqlx::query_as::<_, ConversationRow>(
                "SELECT * FROM conversations WHERE issue_identifier = ?1 ORDER BY created_at ASC",
            )
            .bind(identifier)
            .fetch_all(&self.pool)
            .await?,
            ConversationSubject::Run { run_id } => {
                sqlx::query_as::<_, ConversationRow>(
                    "SELECT * FROM conversations WHERE run_id = ?1 ORDER BY created_at ASC",
                )
                .bind(run_id.0.to_string())
                .fetch_all(&self.pool)
                .await?
            }
        };
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn set_provider_session_id(
        &self,
        id: ConversationId,
        provider_session_id: &str,
        now: DateTime<Utc>,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE conversations SET provider_session_id = ?1, updated_at = ?2 WHERE id = ?3",
        )
        .bind(provider_session_id)
        .bind(now.to_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn set_status(
        &self,
        id: ConversationId,
        status: ConversationStatus,
        now: DateTime<Utc>,
    ) -> Result<()> {
        sqlx::query("UPDATE conversations SET status = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(status.to_string())
            .bind(now.to_rfc3339())
            .bind(id.0.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn set_last_turn_at(&self, id: ConversationId, at: DateTime<Utc>) -> Result<()> {
        sqlx::query("UPDATE conversations SET last_turn_at = ?1, updated_at = ?1 WHERE id = ?2")
            .bind(at.to_rfc3339())
            .bind(id.0.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct ConversationRow {
    id: String,
    issue_identifier: Option<String>,
    run_id: Option<String>,
    agent_id: String,
    provider: String,
    status: String,
    provider_session_id: Option<String>,
    created_at: String,
    updated_at: String,
    last_turn_at: Option<String>,
}

impl ConversationRow {
    fn into_domain(self) -> Result<Conversation> {
        let subject = match (self.issue_identifier, self.run_id) {
            (Some(identifier), None) => ConversationSubject::Issue { identifier },
            (None, Some(run_id)) => ConversationSubject::Run {
                run_id: RunId(uuid::Uuid::parse_str(&run_id)?),
            },
            (Some(_), Some(_)) | (None, None) => {
                return Err(anyhow::anyhow!(
                    "conversation row violates subject CHECK constraint"
                ));
            }
        };
        Ok(Conversation {
            id: ConversationId(uuid::Uuid::parse_str(&self.id)?),
            subject,
            agent_id: self.agent_id,
            provider: deserialize_enum::<AgentProvider>(&self.provider)?,
            status: self
                .status
                .parse::<ConversationStatus>()
                .map_err(anyhow::Error::msg)?,
            provider_session_id: self.provider_session_id,
            created_at: parse_ts(&self.created_at)?,
            updated_at: parse_ts(&self.updated_at)?,
            last_turn_at: self.last_turn_at.as_deref().map(parse_ts).transpose()?,
        })
    }
}

pub struct SqliteTurnRepo {
    pool: SqlitePool,
}

impl SqliteTurnRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl TurnRepo for SqliteTurnRepo {
    async fn create_pending(
        &self,
        conversation_id: ConversationId,
        user_text: &str,
        now: DateTime<Utc>,
    ) -> Result<Turn> {
        let mut tx = self.pool.begin().await?;
        let next_seq: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(seq) + 1, 0) FROM conversation_turns WHERE conversation_id = ?1",
        )
        .bind(conversation_id.0.to_string())
        .fetch_one(&mut *tx)
        .await?;

        let id = TurnId::new();
        sqlx::query(
            "INSERT INTO conversation_turns (\
                 id, conversation_id, seq, user_text, status, usage_json, \
                 error_code, error_message, cancel_reason, created_at, started_at, finished_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, NULL, ?6, NULL, NULL)",
        )
        .bind(id.0.to_string())
        .bind(conversation_id.0.to_string())
        .bind(next_seq)
        .bind(user_text)
        .bind(TurnStatus::Pending.to_string())
        .bind(now.to_rfc3339())
        .execute(&mut *tx)
        .await
        .context("insert conversation_turns row")?;

        tx.commit().await?;

        Ok(Turn {
            id,
            conversation_id,
            seq: u64::try_from(next_seq).context("turn seq out of range")?,
            user_text: user_text.to_string(),
            status: TurnStatus::Pending,
            usage: None,
            error: None,
            cancel_reason: None,
            created_at: now,
            started_at: None,
            finished_at: None,
        })
    }

    async fn get(&self, id: TurnId) -> Result<Option<Turn>> {
        let row =
            sqlx::query_as::<_, TurnRow>("SELECT * FROM conversation_turns WHERE id = ?1 LIMIT 1")
                .bind(id.0.to_string())
                .fetch_optional(&self.pool)
                .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_conversation(&self, conversation_id: ConversationId) -> Result<Vec<Turn>> {
        let rows = sqlx::query_as::<_, TurnRow>(
            "SELECT * FROM conversation_turns WHERE conversation_id = ?1 ORDER BY seq ASC",
        )
        .bind(conversation_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn find_active_for_conversation(
        &self,
        conversation_id: ConversationId,
    ) -> Result<Option<Turn>> {
        let row = sqlx::query_as::<_, TurnRow>(
            "SELECT * FROM conversation_turns \
             WHERE conversation_id = ?1 AND status IN ('pending', 'streaming') \
             ORDER BY seq DESC LIMIT 1",
        )
        .bind(conversation_id.0.to_string())
        .fetch_optional(&self.pool)
        .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn mark_streaming(&self, id: TurnId, now: DateTime<Utc>) -> Result<()> {
        sqlx::query("UPDATE conversation_turns SET status = ?1, started_at = ?2 WHERE id = ?3")
            .bind(TurnStatus::Streaming.to_string())
            .bind(now.to_rfc3339())
            .bind(id.0.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn mark_completed(
        &self,
        id: TurnId,
        usage: Option<&UsageSnapshot>,
        now: DateTime<Utc>,
    ) -> Result<()> {
        let usage_json = usage
            .map(serde_json::to_string)
            .transpose()
            .context("serialize usage snapshot")?;
        sqlx::query(
            "UPDATE conversation_turns SET status = ?1, usage_json = ?2, finished_at = ?3 \
             WHERE id = ?4",
        )
        .bind(TurnStatus::Completed.to_string())
        .bind(usage_json)
        .bind(now.to_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn mark_failed(
        &self,
        id: TurnId,
        code: &str,
        message: &str,
        usage: Option<&UsageSnapshot>,
        now: DateTime<Utc>,
    ) -> Result<()> {
        let usage_json = usage
            .map(serde_json::to_string)
            .transpose()
            .context("serialize usage snapshot")?;
        sqlx::query(
            "UPDATE conversation_turns SET status = ?1, usage_json = ?2, error_code = ?3, \
             error_message = ?4, finished_at = ?5 WHERE id = ?6",
        )
        .bind(TurnStatus::Failed.to_string())
        .bind(usage_json)
        .bind(code)
        .bind(message)
        .bind(now.to_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn mark_cancelled(&self, id: TurnId, reason: &str, now: DateTime<Utc>) -> Result<()> {
        sqlx::query(
            "UPDATE conversation_turns SET status = ?1, cancel_reason = ?2, finished_at = ?3 \
             WHERE id = ?4",
        )
        .bind(TurnStatus::Cancelled.to_string())
        .bind(reason)
        .bind(now.to_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct TurnRow {
    id: String,
    conversation_id: String,
    seq: i64,
    user_text: String,
    status: String,
    usage_json: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    cancel_reason: Option<String>,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
}

impl TurnRow {
    fn into_domain(self) -> Result<Turn> {
        let usage: Option<UsageSnapshot> = self
            .usage_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .context("deserialize usage_json")?;
        let error = match (self.error_code, self.error_message) {
            (Some(code), Some(message)) => Some(TurnFailure { code, message }),
            (None, None) => None,
            _ => return Err(anyhow::anyhow!("turn row has partial error fields")),
        };
        Ok(Turn {
            id: TurnId(uuid::Uuid::parse_str(&self.id)?),
            conversation_id: ConversationId(uuid::Uuid::parse_str(&self.conversation_id)?),
            seq: u64::try_from(self.seq).context("turn seq is negative")?,
            user_text: self.user_text,
            status: self
                .status
                .parse::<TurnStatus>()
                .map_err(anyhow::Error::msg)?,
            usage,
            error,
            cancel_reason: self.cancel_reason,
            created_at: parse_ts(&self.created_at)?,
            started_at: self.started_at.as_deref().map(parse_ts).transpose()?,
            finished_at: self.finished_at.as_deref().map(parse_ts).transpose()?,
        })
    }
}

pub struct SqliteTurnEventRepo {
    pool: SqlitePool,
}

impl SqliteTurnEventRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl TurnEventRepo for SqliteTurnEventRepo {
    async fn append(&self, turn_id: TurnId, envelope: &ProtocolEventEnvelope) -> Result<TurnEvent> {
        let id = TurnEventId::new();
        let envelope_json =
            serde_json::to_string(envelope).context("serialize ProtocolEventEnvelope")?;
        let kind = envelope_kind(&envelope_json);
        sqlx::query(
            "INSERT INTO turn_events (id, turn_id, seq, at, kind, envelope_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id.0.to_string())
        .bind(turn_id.0.to_string())
        .bind(i64::try_from(envelope.seq).context("envelope seq out of range")?)
        .bind(envelope.at.to_rfc3339())
        .bind(&kind)
        .bind(&envelope_json)
        .execute(&self.pool)
        .await
        .context("insert turn_events row")?;

        Ok(TurnEvent {
            id,
            turn_id,
            envelope: envelope.clone(),
        })
    }

    async fn list_by_turn(&self, turn_id: TurnId) -> Result<Vec<TurnEvent>> {
        let rows = sqlx::query_as::<_, TurnEventRow>(
            "SELECT * FROM turn_events WHERE turn_id = ?1 ORDER BY seq ASC",
        )
        .bind(turn_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_turn_after(&self, turn_id: TurnId, after_seq: u64) -> Result<Vec<TurnEvent>> {
        let rows = sqlx::query_as::<_, TurnEventRow>(
            "SELECT * FROM turn_events WHERE turn_id = ?1 AND seq > ?2 ORDER BY seq ASC",
        )
        .bind(turn_id.0.to_string())
        .bind(i64::try_from(after_seq).context("after_seq out of range")?)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn last_seq(&self, turn_id: TurnId) -> Result<Option<u64>> {
        let row: Option<(Option<i64>,)> =
            sqlx::query_as("SELECT MAX(seq) FROM turn_events WHERE turn_id = ?1")
                .bind(turn_id.0.to_string())
                .fetch_optional(&self.pool)
                .await?;
        row.and_then(|(v,)| v)
            .map(|v| u64::try_from(v).context("turn_events.seq negative"))
            .transpose()
    }
}

#[derive(sqlx::FromRow)]
struct TurnEventRow {
    id: String,
    turn_id: String,
    #[sqlx(rename = "seq")]
    _seq: i64,
    #[sqlx(rename = "at")]
    _at: String,
    #[sqlx(rename = "kind")]
    _kind: String,
    envelope_json: String,
}

impl TurnEventRow {
    fn into_domain(self) -> Result<TurnEvent> {
        let envelope: ProtocolEventEnvelope = serde_json::from_str(&self.envelope_json)
            .context("deserialize ProtocolEventEnvelope from turn_events.envelope_json")?;
        Ok(TurnEvent {
            id: TurnEventId(uuid::Uuid::parse_str(&self.id)?),
            turn_id: TurnId(uuid::Uuid::parse_str(&self.turn_id)?),
            envelope,
        })
    }
}

/// Pull the `kind` field out of the serialised envelope without re-parsing
/// the whole JSON. The envelope is `serde(flatten)` so `kind` sits at the
/// top level alongside `seq` / `at`. Falls back to `"unknown"` if the field
/// is missing — which would itself be a serde bug.
fn envelope_kind(envelope_json: &str) -> String {
    serde_json::from_str::<serde_json::Value>(envelope_json)
        .ok()
        .and_then(|v| v.get("kind").and_then(|k| k.as_str()).map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string())
}

fn parse_ts(value: &str) -> Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(value)?.to_utc())
}
