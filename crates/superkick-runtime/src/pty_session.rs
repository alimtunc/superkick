//! Live PTY session model — broadcast output, writer lease, scrollback ring buffer.
//!
//! A `PtySession` represents one active agent PTY. It is created at spawn time
//! and registered in the `PtySessionRegistry` so the API layer can attach
//! browser or external terminals to the live stream.

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use tokio::sync::broadcast;
use tracing::warn;

use superkick_core::{RunId, TakeoverModeKind, TakeoverSessionId};

/// Capacity of the broadcast channel (number of pending messages before lag).
const BROADCAST_CAPACITY: usize = 4096;

/// Maximum scrollback buffer size (512 KiB).
const SCROLLBACK_MAX: usize = 512 * 1024;

// ── Writer Lease ─────────────────────────────────────────────────────

/// Identifies the holder of the exclusive write lease.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriterHolder {
    Browser(String),
    External(String),
}

impl WriterHolder {
    /// Two holders are the same kind if both are Browser or both are External.
    pub fn same_kind(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (Self::Browser(_), Self::Browser(_)) | (Self::External(_), Self::External(_))
        )
    }
}

/// Tracks the single active writer on a PTY session.
#[derive(Debug)]
struct WriterLease {
    holder: WriterHolder,
}

// ── Scrollback Ring Buffer ───────────────────────────────────────────

/// Simple append-only byte buffer with a fixed ceiling.
/// When full, older bytes are dropped from the front.
#[derive(Debug)]
struct RingBuffer {
    data: Vec<u8>,
    max_size: usize,
}

impl RingBuffer {
    fn new(max_size: usize) -> Self {
        Self {
            data: Vec::new(),
            max_size,
        }
    }

    fn append(&mut self, bytes: &[u8]) {
        self.data.extend_from_slice(bytes);
        if self.data.len() > self.max_size {
            let excess = self.data.len() - self.max_size;
            self.data.drain(..excess);
        }
    }

    fn snapshot(&self) -> Vec<u8> {
        self.data.clone()
    }
}

// ── PtySession ───────────────────────────────────────────────────────

/// A live PTY session attached to a running agent process.
pub struct PtySession {
    pub run_id: RunId,
    master_writer: Mutex<Box<dyn Write + Send>>,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    scrollback: Mutex<RingBuffer>,
    resize_handle: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    writer_lease: Mutex<Option<WriterLease>>,
}

impl PtySession {
    /// Create a new session from a PTY master.
    ///
    /// `master_writer` is used for input; `master_pty` for resize.
    pub fn new(
        run_id: RunId,
        master_writer: Box<dyn Write + Send>,
        master_pty: Box<dyn portable_pty::MasterPty + Send>,
    ) -> (Arc<Self>, broadcast::Sender<Vec<u8>>) {
        let (broadcast_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        let session = Arc::new(Self {
            run_id,
            master_writer: Mutex::new(master_writer),
            broadcast_tx: broadcast_tx.clone(),
            scrollback: Mutex::new(RingBuffer::new(SCROLLBACK_MAX)),
            resize_handle: Mutex::new(master_pty),
            writer_lease: Mutex::new(None),
        });
        (session, broadcast_tx)
    }

    /// Subscribe to the live PTY output stream.
    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.broadcast_tx.subscribe()
    }

    /// Get a snapshot of the scrollback buffer for reconnect.
    pub fn scrollback_snapshot(&self) -> Vec<u8> {
        self.scrollback.lock().expect("scrollback lock").snapshot()
    }

    /// Append bytes to the scrollback buffer (called by the output reader).
    pub fn append_scrollback(&self, bytes: &[u8]) {
        self.scrollback
            .lock()
            .expect("scrollback lock")
            .append(bytes);
    }

    /// Try to acquire the writer lease. Returns `true` if granted.
    ///
    /// A new Browser connection always supersedes an existing Browser lease
    /// (handles page reload, React StrictMode double-mount, reconnect).
    /// A Browser cannot take over an External lease and vice versa.
    pub fn acquire_writer(&self, holder: WriterHolder) -> bool {
        let mut lease = self.writer_lease.lock().expect("writer lease lock");
        match lease.as_ref() {
            None => {
                *lease = Some(WriterLease { holder });
                true
            }
            Some(current) if current.holder.same_kind(&holder) => {
                *lease = Some(WriterLease { holder });
                true
            }
            Some(_) => false,
        }
    }

    /// Release the writer lease if held by the given holder.
    pub fn release_writer(&self, holder: &WriterHolder) {
        let mut lease = self.writer_lease.lock().expect("writer lease lock");
        if lease
            .as_ref()
            .is_some_and(|current| &current.holder == holder)
        {
            *lease = None;
        }
    }

    /// Check whether the given holder currently owns the write lease.
    pub fn is_writer(&self, holder: &WriterHolder) -> bool {
        self.writer_lease
            .lock()
            .expect("writer lease lock")
            .as_ref()
            .is_some_and(|current| &current.holder == holder)
    }

    /// Return the current writer holder, if any. Used by the ownership service
    /// to attach writer-lease info to `SessionOwnership` snapshots.
    pub fn current_writer(&self) -> Option<WriterHolder> {
        self.writer_lease
            .lock()
            .expect("writer lease lock")
            .as_ref()
            .map(|l| l.holder.clone())
    }

    /// Check if any writer lease is currently held.
    pub fn has_writer(&self) -> bool {
        self.writer_lease
            .lock()
            .expect("writer lease lock")
            .is_some()
    }

    /// Write input bytes into the PTY master (only if caller holds the lease).
    pub fn write_input(&self, bytes: &[u8]) -> std::io::Result<()> {
        self.master_writer
            .lock()
            .expect("master writer lock")
            .write_all(bytes)
    }

    /// Resize the PTY.
    pub fn resize(&self, cols: u16, rows: u16) {
        let size = portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        if let Err(err) = self.resize_handle.lock().expect("resize lock").resize(size) {
            warn!("PTY resize failed: {err}");
        }
    }
}

// ── PtySessionRegistry ───────────────────────────────────────────────

/// Snapshot of a registered takeover session — the data the API layer needs
/// to render `GET /takeovers` without leaking the underlying `PtySession`.
#[derive(Clone)]
pub struct TakeoverEntry {
    pub takeover_session_id: TakeoverSessionId,
    pub run_id: RunId,
    pub mode: TakeoverModeKind,
    pub opened_at: DateTime<Utc>,
    pub operator_id: Option<String>,
    pub session: Arc<PtySession>,
    /// Set by the takeover service when an operator-driven `close()` runs, so
    /// the watchdog task waiting on `child.wait()` knows to skip its own
    /// `TerminalTakeoverClosed` emission (the operator path already wrote
    /// one). Shared between the registry entry and the watchdog handle.
    pub operator_closed: Arc<AtomicBool>,
}

/// Thread-safe registry of live PTY sessions.
///
/// Two indices coexist:
/// - The original `RunId → Arc<PtySession>` map for the run's primary PTY
///   (legacy supervisor path, terminal-history etc.).
/// - A `TakeoverSessionId → TakeoverEntry` map for SUP-101 takeover PTYs,
///   spawned out-of-band by `TerminalTakeoverService`. Each takeover has its
///   own `WriterHolder` lease, distinct from the primary session, so two
///   browsers can drive two terminals at once on the same run.
///
/// Existing callers keep using `register` / `get` / `remove` unchanged.
#[derive(Default)]
pub struct PtySessionRegistry {
    sessions: Mutex<HashMap<RunId, Arc<PtySession>>>,
    takeovers: Mutex<HashMap<TakeoverSessionId, TakeoverEntry>>,
}

impl PtySessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a live PTY session.
    pub fn register(&self, run_id: RunId, session: Arc<PtySession>) {
        self.sessions
            .lock()
            .expect("registry lock")
            .insert(run_id, session);
    }

    /// Look up a live session by run ID.
    pub fn get(&self, run_id: RunId) -> Option<Arc<PtySession>> {
        self.sessions
            .lock()
            .expect("registry lock")
            .get(&run_id)
            .cloned()
    }

    /// Remove a session (called after deferred cleanup).
    pub fn remove(&self, run_id: RunId) {
        self.sessions.lock().expect("registry lock").remove(&run_id);
    }

    /// Register a takeover PTY session against a run.
    pub fn register_takeover(&self, entry: TakeoverEntry) {
        self.takeovers
            .lock()
            .expect("takeover lock")
            .insert(entry.takeover_session_id, entry);
    }

    /// Look up a takeover by its dedicated id.
    pub fn get_takeover(&self, takeover_id: TakeoverSessionId) -> Option<TakeoverEntry> {
        self.takeovers
            .lock()
            .expect("takeover lock")
            .get(&takeover_id)
            .cloned()
    }

    /// Drop a takeover from the registry. Idempotent.
    pub fn unregister_takeover(&self, takeover_id: TakeoverSessionId) -> Option<TakeoverEntry> {
        self.takeovers
            .lock()
            .expect("takeover lock")
            .remove(&takeover_id)
    }

    /// All active takeovers attached to a run, in insertion order.
    pub fn list_takeovers_for_run(&self, run_id: RunId) -> Vec<TakeoverEntry> {
        self.takeovers
            .lock()
            .expect("takeover lock")
            .values()
            .filter(|entry| entry.run_id == run_id)
            .cloned()
            .collect()
    }
}
