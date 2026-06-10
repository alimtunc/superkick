use superkick_desktop_lib::lifecycle::{BootMachine, BootPhase};

#[test]
fn machine_starts_idle() {
    let machine = BootMachine::default();
    assert_eq!(*machine.phase(), BootPhase::Idle);
}

#[test]
fn start_then_running_happy_path() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p1".into(), 1));
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p1".into()
        }
    );
    assert!(machine.mark_running("p1", 1, 3100));
    assert_eq!(
        *machine.phase(),
        BootPhase::Running {
            project_id: "p1".into(),
            port: 3100
        }
    );
}

#[test]
fn start_is_allowed_from_every_phase() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p1".into(), 1));
    assert!(machine.start("p2".into(), 2));
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p2".into()
        }
    );

    assert!(machine.mark_running("p2", 2, 3100));
    assert!(machine.start("p3".into(), 3));
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p3".into()
        }
    );

    assert!(machine.mark_failed("p3", 3, "boom".into(), Vec::new()));
    assert!(machine.start("p4".into(), 4));
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p4".into()
        }
    );
}

#[test]
fn stale_start_is_rejected_after_a_newer_boot() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p2".into(), 2));
    assert!(
        !machine.start("p1".into(), 1),
        "a preempted boot thread must not clobber the newer Starting state"
    );
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p2".into()
        }
    );
}

#[test]
fn stale_running_report_is_discarded_after_a_switch() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p1".into(), 1));
    assert!(machine.start("p2".into(), 2));
    assert!(!machine.mark_running("p1", 1, 3100));
    assert_eq!(
        *machine.phase(),
        BootPhase::Starting {
            project_id: "p2".into()
        }
    );
}

#[test]
fn stale_same_project_boot_cannot_complete_or_fail_the_newer_one() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p1".into(), 1));
    assert!(machine.start("p1".into(), 2));

    assert!(!machine.mark_running("p1", 1, 3100));
    assert!(machine.mark_running("p1", 2, 3101));

    assert!(!machine.mark_failed("p1", 1, "stale timeout".into(), Vec::new()));
    assert_eq!(
        *machine.phase(),
        BootPhase::Running {
            project_id: "p1".into(),
            port: 3101
        }
    );
}

#[test]
fn running_cannot_be_marked_from_idle_or_failed() {
    let mut machine = BootMachine::default();
    assert!(!machine.mark_running("p1", 0, 3100));

    assert!(machine.start("p1".into(), 1));
    assert!(machine.mark_failed("p1", 1, "boom".into(), Vec::new()));
    assert!(!machine.mark_running("p1", 1, 3100));
}

#[test]
fn failed_applies_to_starting_and_running_of_the_same_project_only() {
    let mut machine = BootMachine::default();
    assert!(machine.start("p1".into(), 1));
    assert!(!machine.mark_failed("p2", 1, "wrong project".into(), Vec::new()));
    assert!(machine.mark_failed("p1", 1, "boot failed".into(), Vec::new()));

    assert!(machine.start("p1".into(), 2));
    assert!(machine.mark_running("p1", 2, 3100));
    assert!(machine.mark_failed("p1", 2, "crashed".into(), vec!["last log line".into()]));
    assert_eq!(
        *machine.phase(),
        BootPhase::Failed {
            project_id: "p1".into(),
            message: "crashed".into(),
            log_tail: vec!["last log line".into()],
        }
    );
}

#[test]
fn failed_does_not_apply_from_idle() {
    let mut machine = BootMachine::default();
    assert!(!machine.mark_failed("p1", 0, "boom".into(), Vec::new()));
    assert_eq!(*machine.phase(), BootPhase::Idle);
}

#[test]
fn boot_phase_serializes_with_a_kebab_case_tag() {
    let json = serde_json::to_value(BootPhase::Failed {
        project_id: "p1".into(),
        message: "boom".into(),
        log_tail: vec!["line".into()],
    })
    .expect("serialize");
    assert_eq!(json["phase"], "failed");
    assert_eq!(json["project_id"], "p1");
    assert_eq!(json["message"], "boom");
    assert_eq!(json["log_tail"][0], "line");
}
