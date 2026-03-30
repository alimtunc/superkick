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

# Format everything
fmt:
    cargo fmt
    cd ui && pnpm fmt

# Lint everything (same as lefthook pre-commit)
lint:
    cargo fmt -- --check
    cargo clippy --workspace -- -D warnings
    cd ui && pnpm lint
    cd ui && pnpm fmt:check

# Run local superkick CLI (pass args: just superkick watch ...)
superkick *args:
    cargo run -p superkick-cli -- {{args}}

# Install local build as global binary
install:
    cargo install --path crates/superkick-cli

# Fetch all dependencies (Rust + JS) in parallel
deps:
    cargo fetch & (cd ui && pnpm install) & wait

# Clean build artifacts
clean:
    cargo clean
    rm -rf ui/dist ui/node_modules/.vite
