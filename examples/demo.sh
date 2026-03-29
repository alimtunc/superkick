#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# Superkick guided demo
#
# An interactive walkthrough that tells you what to run at each stage.
# You run the commands yourself — this script guides and verifies.
#
# The demo uses Superkick's own repo as the target project.
#
# Prerequisites:
#   - git, gh, cargo on PATH
#   - claude (or codex) CLI installed
#   - A GitHub fork or clone of this repo with push access
#
# Usage:
#   ./examples/demo.sh
# ───────────────────────────────────────────────────────────────────────

API="http://127.0.0.1:3100"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

stage()   { echo -e "\n${GREEN}${BOLD}━━━ Stage $1: $2 ━━━${NC}\n"; }
cmd()     { echo -e "  ${CYAN}▸ $*${NC}"; }
note()    { echo -e "  ${DIM}$*${NC}"; }
warning() { echo -e "  ${YELLOW}⚠ $*${NC}"; }

wait_enter() {
    echo ""
    read -rp "  Press Enter when ready... "
    echo ""
}

# ── Stage 1: Prerequisites ───────────────────────────────────────────

stage 1 "Check prerequisites"

echo "  Make sure these tools are on your PATH:"
echo ""
cmd "git    — repo operations"
cmd "gh     — PR creation (run 'gh auth login' first)"
cmd "cargo  — Rust build"
cmd "claude — AI agent (or codex)"
echo ""
echo "  For a full machine check, run:"
cmd "superkick doctor"

MISSING=0
for tool in git gh cargo; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        warning "$tool not found on PATH"
        MISSING=1
    fi
done

# Check for at least one agent
if ! command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1; then
    warning "Neither claude nor codex found on PATH"
    MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    warning "Some prerequisites are missing. Install them before continuing."
    exit 1
fi

echo -e "  ${GREEN}All prerequisites found.${NC}"

wait_enter

# ── Stage 2: Build ───────────────────────────────────────────────────

stage 2 "Build superkick"

echo "  Build the CLI and server from source:"
echo ""
cmd "cargo build --release"
echo ""
note "This produces target/release/superkick (CLI) and target/release/superkick-api (server)."
note "Add target/release to your PATH or use cargo run."

wait_enter

# ── Stage 3: Initialize config ──────────────────────────────────────

stage 3 "Initialize project config"

echo "  From the repo root, create a superkick.yaml:"
echo ""
cmd "superkick init"
echo ""
note "This creates a starter config. Edit it to match your project."
note "For this demo, use examples/superkick.yaml which targets this Rust repo:"
echo ""
cmd "cp examples/superkick.yaml superkick.yaml"
echo ""
note "Key settings:"
note "  - agents: planner, coder, reviewer (all using claude)"
note "  - commands: cargo test, cargo clippy"
note "  - interrupts: ask_human on blocked steps"

wait_enter

# ── Stage 4: Start the server ───────────────────────────────────────

stage 4 "Start the server"

echo "  Open a second terminal and run:"
echo ""
cmd "superkick serve"
echo ""
note "The server starts on port 3100 by default."
note "It creates a local SQLite database for run state."
echo ""
echo "  Waiting for the server to be reachable..."

ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if curl -sf "$API/health" >/dev/null 2>&1; then
        echo -e "  ${GREEN}Server is healthy at $API${NC}"
        break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    sleep 2
done

if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
    warning "Server not reachable at $API after 60 seconds."
    warning "Make sure 'superkick serve' is running in another terminal."
    exit 1
fi

wait_enter

# ── Stage 5: Launch a run ───────────────────────────────────────────

stage 5 "Launch a run"

echo "  Trigger a run for an issue. The --follow flag streams live events:"
echo ""
cmd "superkick run SK-ISSUE-005 --follow"
echo ""
note "This will:"
note "  1. Clone the repo into a worktree"
note "  2. Run the planner agent"
note "  3. Run the coder agent"
note "  4. Execute cargo test + cargo clippy"
note "  5. Run two review agents in parallel"
note "  6. Open a PR on GitHub"
echo ""
note "Press Ctrl+C to detach — the run continues server-side."
echo ""
echo "  To also watch in the dashboard, open another terminal:"
echo ""
cmd "cd ui && pnpm dev"
echo ""
note "Then open http://localhost:5173 in your browser."

wait_enter

# ── Stage 6: Observe and control ────────────────────────────────────

stage 6 "Observe and control"

echo "  Check server health and active runs:"
echo ""
cmd "superkick status"
echo ""
echo "  Cancel a run by its ID:"
echo ""
cmd "superkick status                              # find the run ID"
cmd "superkick cancel <run-id>"
echo ""
echo "  If a step fails and the run pauses (waiting_human),"
echo "  respond to the interrupt in the dashboard or via the API:"
echo ""
cmd "curl http://127.0.0.1:3100/runs/<run-id>/interrupts | jq"
echo ""
note "The dashboard shows interrupts inline on the run detail page."

echo ""
echo -e "${GREEN}${BOLD}━━━ Demo complete ━━━${NC}"
echo ""
echo "  You've seen the full superkick path:"
echo "    issue → config → serve → run → observe → control"
echo ""
echo "  Next steps:"
echo "    - Edit superkick.yaml for your own project"
echo "    - Try different agents (codex instead of claude)"
echo "    - Run the smoke tests: ./examples/smoke-test.sh"
echo ""
