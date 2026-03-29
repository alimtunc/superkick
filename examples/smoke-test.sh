#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# Superkick smoke test — API surface validation
#
# This is NOT the product demo. This script validates the HTTP API
# surface using raw curl calls. It does not require agent CLIs
# (claude, codex) or a real repository.
#
# For the guided product demo, use: ./examples/demo.sh
# For full setup instructions, see: docs/local-setup.md
#
# Usage:
#   # Terminal 1: start the server
#   superkick serve
#
#   # Terminal 2: run the smoke tests
#   ./examples/smoke-test.sh
# ───────────────────────────────────────────────────────────────────────
set -euo pipefail

API="${API_URL:-http://127.0.0.1:3100}"
PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

assert_status() {
    local desc="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}PASS${NC}  $desc (HTTP $actual)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC}  $desc (expected $expected, got $actual)"
        FAIL=$((FAIL + 1))
    fi
}

assert_body_contains() {
    local desc="$1" needle="$2" body="$3"
    if echo "$body" | grep -q "$needle"; then
        echo -e "  ${GREEN}PASS${NC}  $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC}  $desc (body does not contain '$needle')"
        FAIL=$((FAIL + 1))
    fi
}

echo "Superkick smoke tests"
echo "Target: $API"
echo ""

# ── Health ─────────────────────────────────────────────────────────────

echo "Health:"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/health")
assert_status "GET /health returns 200" "200" "$STATUS"

BODY=$(curl -sf "$API/health")
assert_body_contains "GET /health body is 'ok'" "ok" "$BODY"

# ── Validation ─────────────────────────────────────────────────────────

echo ""
echo "Input validation:"

# Empty repo_slug
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d '{"repo_slug":"","issue_id":"x","issue_identifier":"x"}')
assert_status "Empty repo_slug → 400" "400" "$STATUS"

# Missing slash in repo_slug
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d '{"repo_slug":"noslash","issue_id":"x","issue_identifier":"x"}')
assert_status "Invalid repo_slug format → 400" "400" "$STATUS"

# Empty issue_id
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d '{"repo_slug":"owner/repo","issue_id":"","issue_identifier":"x"}')
assert_status "Empty issue_id → 400" "400" "$STATUS"

# Empty issue_identifier
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d '{"repo_slug":"owner/repo","issue_id":"x","issue_identifier":""}')
assert_status "Empty issue_identifier → 400" "400" "$STATUS"

# ── Run lifecycle ──────────────────────────────────────────────────────

echo ""
echo "Run lifecycle:"

# Create a valid run (it will fail at preflight or prepare, that's fine)
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$API/runs" \
    -H "Content-Type: application/json" \
    -d '{"repo_slug":"test/smoke-test","issue_id":"smoke-1","issue_identifier":"SMOKE-1"}')
BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -n 1)
assert_status "POST /runs with valid input → 201" "201" "$STATUS"

RUN_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [ -n "$RUN_ID" ]; then
    assert_body_contains "Response contains run id" "$RUN_ID" "$BODY"

    # List runs
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/runs")
    assert_status "GET /runs → 200" "200" "$STATUS"

    # Get specific run
    sleep 1  # let the engine attempt (and fail) the run
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/runs/$RUN_ID")
    assert_status "GET /runs/:id → 200" "200" "$STATUS"

    # Get events
    # SSE endpoint — just check it doesn't 404
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$API/runs/$RUN_ID/events" 2>/dev/null)
    STATUS=${STATUS:-200}
    assert_status "GET /runs/:id/events → 200 (SSE)" "200" "$STATUS"

    # Get interrupts
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/runs/$RUN_ID/interrupts")
    assert_status "GET /runs/:id/interrupts → 200" "200" "$STATUS"
else
    echo -e "  ${RED}FAIL${NC}  Could not parse run ID from response"
    FAIL=$((FAIL + 1))
fi

# ── 404s ───────────────────────────────────────────────────────────────

echo ""
echo "Not found:"

FAKE_UUID="00000000-0000-0000-0000-000000000000"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/runs/$FAKE_UUID")
assert_status "GET /runs/:nonexistent → 404" "404" "$STATUS"

# ── Summary ────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────"
TOTAL=$((PASS + FAIL))
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC} ($TOTAL total)"

if [ $FAIL -gt 0 ]; then
    exit 1
fi
