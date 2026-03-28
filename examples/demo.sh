#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# Superkick end-to-end demo
#
# Walks through the happy path:
#   1. Start the API server
#   2. Create a run (Linear issue -> local execution -> PR)
#   3. Observe the run via polling
#   4. Demonstrate the interrupt (failure) path
#
# Prerequisites:
#   - cargo build completed (cargo build --release)
#   - git, gh, claude CLI installed and on PATH
#   - GITHUB_TOKEN set (for gh pr create)
#   - A real GitHub repo to target (defaults to owner/repo below)
#
# Usage:
#   ./examples/demo.sh                    # interactive walkthrough
#   REPO_SLUG=owner/repo ./examples/demo.sh  # target a specific repo
# ───────────────────────────────────────────────────────────────────────
set -euo pipefail

API="http://127.0.0.1:3100"
REPO_SLUG="${REPO_SLUG:-}"
ISSUE_ID="${ISSUE_ID:-demo-001}"
ISSUE_IDENTIFIER="${ISSUE_IDENTIFIER:-SK-DEMO-001}"
BASE_BRANCH="${BASE_BRANCH:-main}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; exit 1; }
header(){ echo -e "\n${BOLD}── $* ──${NC}"; }

# ── Preflight ──────────────────────────────────────────────────────────

header "Preflight checks"

for tool in git gh curl jq; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool is required but not found on PATH"
    ok "$tool found"
done

if [ -z "$REPO_SLUG" ]; then
    echo ""
    echo -e "${BOLD}No REPO_SLUG set.${NC}"
    echo "Enter a GitHub repo slug to target (e.g. yourname/yourrepo):"
    read -r REPO_SLUG
    [ -z "$REPO_SLUG" ] && fail "REPO_SLUG is required"
fi

info "Targeting repo: $REPO_SLUG"
info "Issue: $ISSUE_IDENTIFIER ($ISSUE_ID)"
info "Base branch: $BASE_BRANCH"

# ── 1. Health check ───────────────────────────────────────────────────

header "Step 1: Health check"
info "Checking if the API server is running at $API ..."

if ! curl -sf "$API/health" >/dev/null 2>&1; then
    fail "API server not reachable at $API. Start it first:\n\n  SUPERKICK_CONFIG=examples/superkick.yaml DATABASE_URL=sqlite:superkick.db PORT=3100 cargo run -p superkick-api\n"
fi
ok "API server is healthy"

# ── 2. Create a run (happy path) ─────────────────────────────────────

header "Step 2: Create a run"
info "POST $API/runs"

RESPONSE=$(curl -sf -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d "{
        \"repo_slug\": \"$REPO_SLUG\",
        \"issue_id\": \"$ISSUE_ID\",
        \"issue_identifier\": \"$ISSUE_IDENTIFIER\",
        \"base_branch\": \"$BASE_BRANCH\"
    }")

RUN_ID=$(echo "$RESPONSE" | jq -r '.id')
RUN_STATE=$(echo "$RESPONSE" | jq -r '.state')

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    fail "Failed to create run. Response:\n$RESPONSE"
fi

ok "Run created: $RUN_ID (state: $RUN_STATE)"

# ── 3. Poll until terminal ───────────────────────────────────────────

header "Step 3: Observe the run"
info "Polling run status every 3 seconds ..."
echo ""

POLL_COUNT=0
MAX_POLLS=200  # ~10 minutes

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    RUN_DATA=$(curl -sf "$API/runs/$RUN_ID")
    STATE=$(echo "$RUN_DATA" | jq -r '.run.state')
    STEP=$(echo "$RUN_DATA" | jq -r '.run.current_step_key // "none"')
    ERROR=$(echo "$RUN_DATA" | jq -r '.run.error_message // empty')

    printf "\r  state=%-18s step=%-15s" "$STATE" "$STEP"

    case "$STATE" in
        completed)
            echo ""
            ok "Run completed successfully!"
            # Show artifacts
            PR_URL=$(echo "$RUN_DATA" | jq -r '.steps[-1].output_json // empty')
            if [ -n "$PR_URL" ]; then
                info "PR URL may be in the artifacts or step output."
            fi
            break
            ;;
        failed)
            echo ""
            fail "Run failed: $ERROR"
            ;;
        cancelled)
            echo ""
            fail "Run was cancelled"
            ;;
        waiting_human)
            echo ""
            info "Run is waiting for human input."
            echo ""
            # Show the interrupt
            INTERRUPTS=$(curl -sf "$API/runs/$RUN_ID/interrupts")
            INTERRUPT_ID=$(echo "$INTERRUPTS" | jq -r '.[0].id // empty')
            QUESTION=$(echo "$INTERRUPTS" | jq -r '.[0].question // empty')

            if [ -n "$INTERRUPT_ID" ]; then
                echo -e "  ${BOLD}Interrupt:${NC} $QUESTION"
                echo ""
                echo "  Options:"
                echo "    1) Retry the failed step"
                echo "    2) Continue with a note"
                echo "    3) Abort the run"
                echo ""
                read -rp "  Choice [1/2/3]: " CHOICE

                case "$CHOICE" in
                    1)
                        curl -sf -X POST "$API/runs/$RUN_ID/interrupts/$INTERRUPT_ID/answer" \
                            -H "Content-Type: application/json" \
                            -d '"RetryStep"' >/dev/null
                        ok "Sent: RetryStep"
                        ;;
                    2)
                        read -rp "  Note: " NOTE
                        curl -sf -X POST "$API/runs/$RUN_ID/interrupts/$INTERRUPT_ID/answer" \
                            -H "Content-Type: application/json" \
                            -d "{\"ContinueWithNote\":{\"note\":\"$NOTE\"}}" >/dev/null
                        ok "Sent: ContinueWithNote"
                        ;;
                    3)
                        curl -sf -X POST "$API/runs/$RUN_ID/interrupts/$INTERRUPT_ID/answer" \
                            -H "Content-Type: application/json" \
                            -d '"AbortRun"' >/dev/null
                        ok "Sent: AbortRun"
                        ;;
                    *)
                        fail "Invalid choice"
                        ;;
                esac
            fi
            ;;
    esac

    POLL_COUNT=$((POLL_COUNT + 1))
    sleep 3
done

if [ $POLL_COUNT -ge $MAX_POLLS ]; then
    fail "Timed out waiting for run to finish"
fi

# ── 4. Show final state ──────────────────────────────────────────────

header "Final run state"
curl -sf "$API/runs/$RUN_ID" | jq '.run | {id, state, issue_identifier, branch_name, error_message, started_at, finished_at}'

echo ""
header "Steps"
curl -sf "$API/runs/$RUN_ID" | jq '.steps[] | {step_key, status, attempt, error_message}'

echo ""
ok "Demo complete."
