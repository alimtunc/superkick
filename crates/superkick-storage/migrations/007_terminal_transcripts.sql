-- Durable terminal transcript storage — raw PTY output chunks per run.
CREATE TABLE IF NOT EXISTS terminal_transcripts (
    id        TEXT    PRIMARY KEY NOT NULL,
    run_id    TEXT    NOT NULL REFERENCES runs(id),
    sequence  INTEGER NOT NULL,
    ts        TEXT    NOT NULL,
    payload   BLOB    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_terminal_transcripts_run_seq
    ON terminal_transcripts(run_id, sequence);
