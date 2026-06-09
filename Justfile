# Compile check (fast: no lint, no fmt)
check:
    cargo check --workspace
    cd ui && pnpm tsc --noEmit

# Run API + dashboard in parallel.
# API writes .superkick-port on bind; dashboard reads it for proxy target.
dev:
    just dev-api & just _wait-for-api && just dashboard & wait

dev-api:
    cargo run -p superkick-api

dashboard:
    cd ui && pnpm dev

# Wait until the API has written its port file (max 10s).
_wait-for-api:
    bash -c 'for i in $(seq 1 20); do [ -f .superkick-port ] && exit 0; sleep 0.5; done; echo "warning: .superkick-port not found after 10s"'

# Build everything
build:
    cargo build
    cd ui && pnpm build

# Build UI + an embedded-ui server, then run the Tauri desktop shell. Leaves `dev` untouched. macOS: needs Xcode CLT.
tauri-dev:
    cd ui && pnpm build
    cargo build -p superkick-api --features embedded-ui
    cargo run -p superkick-desktop

# Compile the desktop shell only (no bundler/signing yet).
tauri-build:
    cargo build -p superkick-desktop

# Format everything
fmt:
    cargo fmt
    cd ui && pnpm fmt

# Lint everything (same as lefthook pre-commit)
lint:
    cargo fmt -- --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cd ui && pnpm lint
    cd ui && pnpm fmt:check

# Capture Issue-centered V1 mockup/app/diff screenshots.
visual-parity *args:
    cd ui && pnpm visual:parity -- {{args}}

# Run local superkick CLI (pass args: just superkick watch ...)
superkick *args:
    cargo run -p superkick-cli -- {{args}}

# Install local build as global binary, bundling the dashboard
install:
    cd ui && pnpm install --frozen-lockfile && pnpm build
    cargo install --path crates/superkick-cli --features embedded-ui --force

# Fetch all dependencies (Rust + JS) in parallel
deps:
    cargo fetch & (cd ui && pnpm install) & wait

# Clean build artifacts
clean:
    cargo clean
    rm -rf ui/dist ui/node_modules/.vite

# SUP-137 — V1 release-validation harness.
# Spawns real provider CLIs against the canonical V1 issue. Opt-in: the
# harness file is `#[ignore]` by default so plain `cargo test` does not
# fire it. See docs/release/checklist.md for the full ship gate.
release-check:
    cargo test -p superkick-runtime --test release_validation -- --ignored --nocapture
