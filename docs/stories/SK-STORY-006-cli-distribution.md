# SK-STORY-006 - Distribute the Superkick CLI Binary

## User Story

As a developer who wants to use Superkick,
I want to install the CLI with a single command,
so that I don't need to clone the repo or have Rust installed.

## Why This Story Exists

Today `superkick doctor` and `superkick init` exist but require building from
source with `cargo`. This is fine for contributors but blocks adoption by
non-Rust developers. A real product entry point needs a frictionless install.

## Scope

- define the distribution strategy for the `superkick` binary
- support at least one zero-Rust install path
- keep the install step aligned with the "once per machine" model from SK-STORY-001

## Options to Evaluate

| Channel | Reach | Effort |
|---------|-------|--------|
| `cargo install superkick-cli` (crates.io) | Rust users | low — `cargo publish` |
| GitHub Release binaries (macOS arm64/x86, Linux) | everyone | medium — CI cross-compile |
| Homebrew tap | macOS users | medium — tap repo + formula |
| One-liner install script (`curl \| sh`) | everyone | low once binaries exist |

## Acceptance Criteria

- a developer without Rust can install `superkick` in one command
- `superkick --version` works after install
- the install docs in `docs/local-setup.md` reflect the chosen method
- the CI pipeline produces release binaries on tag push

## Out of Scope

- desktop packaging (`.dmg`, `.msi`)
- auto-update mechanism
- Windows support in V1

## Notes

- GitHub Releases with cross-compiled binaries is likely the best first step —
  it unblocks the install script and Homebrew formula later.
- `cargo-dist` or `cross` can simplify the CI matrix.
- The binary name must stay `superkick` (not `superkick-cli`).

## Open Questions

- Should `superkick-api` be distributed as a separate binary or bundled?
- Should the install script also run `superkick doctor` after install?
