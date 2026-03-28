# Compile check (fast: no lint, no fmt)
check:
    cargo check --workspace
    cd ui && pnpm tsc --noEmit

# Run API + dashboard in parallel
dev:
    just dev-api & just dashboard & wait

dev-api:
    cargo run -p superkick-api

dashboard:
    cd ui && pnpm dev

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

# Clean build artifacts
clean:
    cargo clean
    rm -rf ui/dist ui/node_modules/.vite
