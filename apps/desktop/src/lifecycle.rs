use serde::Serialize;

/// Desktop boot state for the active project, emitted to the picker page as
/// `superkick://boot` events. Pure data — the supervisor owns the side effects.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "phase", rename_all = "kebab-case")]
pub enum BootPhase {
    #[default]
    Idle,
    Starting {
        project_id: String,
    },
    Running {
        project_id: String,
        port: u16,
    },
    Failed {
        project_id: String,
        message: String,
        log_tail: Vec<String>,
    },
}

#[must_use]
pub fn server_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Boot state machine. Every transition carries the boot epoch of the thread
/// requesting it; the machine remembers the newest epoch it has accepted and
/// returns `false` for anything older. Project ids alone cannot guard this —
/// two boots of the *same* project (double-clicked retry) would pass an
/// id-only check and clobber each other's state.
#[derive(Debug, Default)]
pub struct BootMachine {
    phase: BootPhase,
    epoch: u64,
}

impl BootMachine {
    #[must_use]
    pub fn phase(&self) -> &BootPhase {
        &self.phase
    }

    /// Begins a boot. Applies from every phase — a newer selection always
    /// wins — but never for an epoch older than one already accepted.
    pub fn start(&mut self, project_id: String, epoch: u64) -> bool {
        if epoch < self.epoch {
            return false;
        }
        self.epoch = epoch;
        self.phase = BootPhase::Starting { project_id };
        true
    }

    /// Only the boot in flight for this exact epoch may complete.
    pub fn mark_running(&mut self, project_id: &str, epoch: u64, port: u16) -> bool {
        match &self.phase {
            BootPhase::Starting {
                project_id: current,
            } if current == project_id && epoch == self.epoch => {
                self.phase = BootPhase::Running {
                    project_id: project_id.to_string(),
                    port,
                };
                true
            }
            _ => false,
        }
    }

    /// A boot failure or a crash of the running server, for the in-flight
    /// epoch only — a superseded boot reporting late must not flip the state.
    pub fn mark_failed(
        &mut self,
        project_id: &str,
        epoch: u64,
        message: String,
        log_tail: Vec<String>,
    ) -> bool {
        let applies = epoch == self.epoch
            && matches!(
                &self.phase,
                BootPhase::Starting { project_id: current } | BootPhase::Running { project_id: current, .. }
                    if current == project_id
            );
        if applies {
            self.phase = BootPhase::Failed {
                project_id: project_id.to_string(),
                message,
                log_tail,
            };
        }
        applies
    }
}
