# Chat-first workspace — final product direction

Status: final merged product direction for SUP-106.

This document merges the strongest parts of the Claude design brief and the independent Codex product brief.

## 1. Product thesis

Superkick should not be a dashboard with agent chat added on top.

Superkick should become a **local-first agentic issue workspace**:

```text
Issue = workspace
Chat = collaboration
Run = execution evidence
Terminal = escape hatch
Orchestrator = multi-issue coordinator
```

The operator opens an issue, talks to the right agent, watches structured work happen, answers decisions, reviews evidence, and takes over the terminal only when needed.

## 2. What stays fixed

The top-level navigation stays:

```text
Inbox
Issues
Runs
Agents
Settings
```

The V1 visual direction from `docs/conventions/visual-design.md` stays:

```text
calm
dense
dark
Linear/Multica-inspired
semantic accents
no terminal-first comeback
```

The product remains Linear-first:

```text
Linear = backlog source of truth
Superkick = execution and orchestration control plane
```

## 3. Differentiation

Most adjacent tools own one layer:

| Tool shape | Optimizes | Missing |
|---|---|---|
| Linear/Jira | issue structure | agent execution |
| Cursor/Claude chat | conversational coding | durable issue/run orchestration |
| Claude Code/Codex CLI | local agent power | product supervision UI |
| GitHub Actions/CI | execution trace | human-agent collaboration |
| Multica-style runtimes | local agent availability | issue-first orchestration |

Superkick owns the chain:

```text
Linear issue
  -> agent chat in context
    -> protocol turns
      -> local worktree execution
        -> structured tool evidence
          -> run history / PR / blockers
            -> terminal takeover if needed
              -> future orchestrator over linked issues
```

That chain is the product moat.

## 4. Design principles

1. **Issue-first, not run-first.** Operators think in issues and features. Runs are execution records.
2. **Conversation-first, not terminal-first.** Daily collaboration happens through structured chat. Terminal is for inspection, continuation, and force takeover.
3. **Evidence over logs.** Tool calls, tests, PRs, checkpoints, and blockers render as proof of work. Raw logs stay expandable.
4. **Actionable surfaces.** Inbox rows, run cards, and issue panels name the next action: answer, approve, review, open chat, inspect terminal, take over.
5. **Configuration fades into defaults.** Agents, modes, models, runtimes, and MCP permissions are available, but the default should feel like "ask the right agent".
6. **Orchestration grows from parent issues.** Do not introduce a global Orchestrator page before real orchestrator sessions exist in daily use.

## 5. Target issue workspace

Issue detail becomes the primary workspace.

Desktop target:

```text
┌────────────────────────────────────────────────────────────────────┐
│ SUP-123 · Title · status · primary actions                         │
├──────────────────────┬────────────────────────────────┬────────────┤
│ Issue Context         │ Agent Workspace                │ Control     │
│                       │                                │ Rail        │
│ summary               │ conversations                  │ properties  │
│ description           │ active turn                    │ agent/mode  │
│ acceptance criteria   │ tool evidence                  │ latest run  │
│ links / PRs           │ result / next action           │ launch      │
│ child issues          │ composer                       │ takeover    │
└──────────────────────┴────────────────────────────────┴────────────┘
```

Priority:

1. Agent Workspace
2. Control Rail
3. Issue Context

The issue description remains available, but it should not dominate the page once agent work exists.

## 6. Agent workspace

The chat area should explain the work, not just display messages.

Target anatomy:

```text
Conversation sidebar
  New chat
  Conversation list
  state: draft / running / needs human / completed / failed / taken over

Main conversation
  agent + mode + linked run status
  transcript
  tool evidence
  next action
  composer
```

Each conversation should answer:

- Who is working?
- What mode is it using?
- Is work running now?
- What did the last turn do?
- What does the operator need to do next?

## 7. Tool calls as proof of work

Protocol events should become human-readable evidence.

Bad:

```text
tool_use: shell_command
args: {"cmd":"cargo test --workspace"}
```

Good:

```text
Ran tests
cargo test --workspace
357 passed · 42s
```

Collapsed:

```text
Edited files · 4 files
Ran tests · passed
Opened PR · #82
```

Expanded:

```text
command
output excerpt
files touched
exit code
duration
```

This is why protocol-first matters. If the UI only shows assistant prose, the product wastes the structured event layer.

## 8. Run detail

Run detail should become a supervision surface, not an eleven-section technical scroll.

Target:

```text
┌─────────────────────────────────────────────────────────────┐
│ Run header                                                   │
├──────────────────────────────────┬──────────────────────────┤
│ Chat / active conversation       │ Status rail              │
│                                  │ state                    │
│ pending decisions                │ budget                   │
│ transcript                       │ steps                    │
│ tool evidence                    │ sessions                 │
│ composer                         │ PR/review                │
├──────────────────────────────────┴──────────────────────────┤
│ Expandable evidence: ledger, review results, terminal       │
└─────────────────────────────────────────────────────────────┘
```

Keep `RunLedger`, `StepTimeline`, `SessionList`, `ReviewResults`, and `TerminalTakeover`, but recompose them around the active conversation.

Do not merge every event into one mega-feed. Chat events and orchestration ledger events have different purposes and cadence.

## 9. Terminal takeover

Terminal stays available but secondary.

Labels should stay honest:

```text
Inspect workspace
Continue in terminal
Force takeover
```

Avoid generic "Attach" language for protocol-first runs. It implies a live PTY attach that may not exist.

Terminal is a trust and recovery feature. It should be easy to find, but visually quiet.

## 10. Inbox and runs dashboard

Inbox should be an interruption queue, not a metrics dashboard.

Top priority:

```text
Needs you
  Answer
  Approve
  Review
  Resume
  Take over
```

Every row should name the next action.

Runs dashboard should show protocol/chat status, not just lifecycle state:

```text
Issue
Agent / mode
Conversation state
Last meaningful action
Needs-human count
PR / review state
Primary action
Secondary terminal action
```

## 11. Orchestrator UX

Start the orchestrator on parent issues.

Recommended parent issue module:

```text
Feature coordination
├─ orchestrator status
├─ latest checkpoint
├─ child issues
├─ active child runs
├─ blockers
├─ decisions needed
└─ next proposed action
```

Do not create a top-level Orchestrations page until parent-issue orchestrator usage is proven.

## 12. Agent and runtime selection

Daily UX should start from intent:

```text
Ask Coder
Ask Reviewer
Ask Planner
Implement this issue
Continue previous chat
```

Advanced controls remain available:

```text
provider
model
mode
runtime
MCP permissions
```

Preference rule:

```text
subject preferences > agent defaults > global defaults
```

If an operator uses plan mode on `SUP-123`, Superkick should remember that for this issue.

## 13. Implementation sequence

### 1. Issue workspace layout

Recompose issue detail around the Agent Workspace. Keep the current `ChatPanel`, but make it central. Move description/activity into secondary areas. Add a compact control rail for properties, latest run, launch, and terminal takeover entry.

Stack: frontend.

### 2. Run detail chat-primary layout

Make active chat/conversation primary. Move run hero, budget, steps, sessions, review, and ledger into a status/evidence hierarchy. Keep terminal takeover compact and secondary.

Stack: frontend.

### 3. Conversation state summary

Compute and surface UX states for conversations:

```text
draft / running / needs human / completed / failed / taken over
```

Show state in conversation sidebar, issue workspace, and run cards.

Stack: likely cross-stack.

### 4. Inbox and run card action verbs

Add action labels and routes:

```text
Answer
Approve
Review PR
Open chat
Inspect terminal
Take over
```

Stack: frontend.

### 5. Run cards protocol status

Expose turn count, last tool, streaming flag, and conversation state on run cards.

Recommended backend shape: extend dashboard/run summary payload with a small `chat_status` aggregate rather than adding per-run requests.

Stack: cross-stack.

### 6. Subject-level chat preferences

Persist mode/model/agent defaults per issue/run subject.

Stack: frontend.

### 7. Parent issue orchestrator module

Surface child issues, orchestrator session status, latest checkpoint, child runs, blockers, and decisions on parent issue detail.

Stack: frontend using existing SUP-102 APIs first.

## 14. Final product call

The next design pass should not be "make Superkick prettier".

The next design pass should make agent work feel native to an issue:

```text
chat is not a widget
runs are not separate machinery
terminal is not the star
orchestrator is not a mystery agent
every surface tells the operator what to do next
```

If this works, Superkick becomes a new category: a local-first execution workspace for Linear issues.
