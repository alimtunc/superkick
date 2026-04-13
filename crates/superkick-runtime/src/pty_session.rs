//! Live PTY session model — broadcast output, writer lease, scrollback ring buffer.
//!
//! A `PtySession` represents one active agent PTY. It is created at spawn time
//! and registered in the `PtySessionRegistry` so the API layer can attach
//! browser or external terminals to the live stream.

use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};

use tokio::sync::broadcast;
use tracing::warn;

use superkick_core::RunId;

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

/// Thread-safe registry of live PTY sessions, keyed by `RunId`.
#[derive(Default)]
pub struct PtySessionRegistry {
    sessions: Mutex<HashMap<RunId, Arc<PtySession>>>,
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
}
