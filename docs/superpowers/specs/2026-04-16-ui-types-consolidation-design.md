# UI Types Consolidation — Design

**Date**: 2026-04-16
**Scope**: `ui/src/`
**Type**: Refactor (no behavior change)

## Problem

Types are scattered across ~50 files in the UI codebase. Some are genuinely local (component `Props`, hook-internal state, store state), but many cross-cutting domain types live inline in `lib/domain/`, `api.ts`, hooks, or components — making them hard to find, review, and reuse.

The existing `src/types/domain.ts` (347 lines) already holds API contracts and core entities, but it's monolithic and doesn't cover the scattered domain-adjacent types.

## Goal

Consolidate all **non-local, domain-meaningful** types into `src/types/`, split by sub-domain for readability.

## Scope

### In scope (moves to `src/types/`)

- API contracts currently inline in `api.ts`: `ServerConfigResponse`, `CreateRunRequest`, `CreateAttentionRequest`
- Domain logic types currently in `lib/domain/`: `NarrativeTone`, `RunNarrative`, `AttentionSummary`, `IssueBucket`, `ClassifiedIssues`, `ClassifiedRuns`, `IssueGroup`, `GroupedIssues`, `DistItem`
- Exported semi-shared types: `CommentNode` (IssueComments), `LaunchParams` (useCreateRun), `ProviderGroupData` (ProviderGroup), `BucketFilter` (IssueFilters), `RunFilter` (useRuns)

### Out of scope (stays in place)

- Component `*Props` interfaces
- Non-exported local types (`FilterCategory`, `StatusVisual`, `NavItem`, `CommandItem`, `FilterCriteria`, `TerminalStatus`, `Capabilities`)
- Hook return-type aliases: `DashboardData`, `IssuesData`, `IssueDetailData`, `IssueFiltersState` (derived via `ReturnType<typeof useXxx>` — must stay with hook)
- Store internal state (`WatchedSessionsState`, `CommandBarState`, etc.)
- Routing: `RouterContext`, `AppRouter` (stays in `routes/`)

## Target structure

```
src/types/
  index.ts           barrel — re-exports every file
  runs.ts            Run, RunStep, RunState, StepKey, StepStatus, ExecutionMode,
                     RunFilter, ClassifiedRuns, ProviderGroupData, LinkedRunSummary
  events.ts          RunEvent, EventKind, EventLevel
  agents.ts          AgentSession, AgentProvider, AgentStatus, AttachPayload
  interrupts.ts      Interrupt, InterruptStatus, InterruptAction
  attention.ts       AttentionRequest, AttentionKind, AttentionStatus,
                     AttentionReply, AttentionSummary
  issues.ts          LinearStateType, IssueStatus, IssuePriority, IssueLabel,
                     IssueAssignee, IssueParentRef, IssueChildRef, IssueProject,
                     IssueCycle, IssueComment, LinearIssueListItem,
                     IssueListResponse, IssueDetailResponse, IssueBucket,
                     ClassifiedIssues, IssueGroup, GroupedIssues, BucketFilter,
                     CommentNode
  pr.ts              PullRequest, PrState, LinkedPrSummary
  review.ts          ReviewFinding, ReviewSwarmResult
  launch.ts          LaunchProfile, LaunchParams
  narrative.ts       NarrativeTone, RunNarrative
  dashboard.ts       DistItem
  api.ts             ServerConfigResponse, CreateRunRequest, CreateAttentionRequest
```

`domain.ts` is deleted; its content is split across the files above.

## Import convention

Single entry point: `import { ... } from '@/types'`.

Rationale:
- Only one path to remember.
- Tree-shaking is not a concern — the files contain only TypeScript types, which are erased at compile time (zero runtime cost). Barrel re-exports of pure type modules have no impact on bundle size.
- If a type happens to be a value-carrying alias later (e.g., a const enum), we can revisit.

## Migration strategy

1. Create the 12 new files in `types/`, moving content out of `domain.ts`.
2. Extract scattered types (api.ts, lib/domain/*, hooks, components) into the correct `types/` file.
3. Delete `domain.ts`.
4. Update `types/index.ts` to re-export everything.
5. Update all import sites to `from '@/types'`.
6. Validate with `pnpm typecheck`, `pnpm lint`, `just check`.

## Risks

- **Circular imports**: `LinkedRunSummary` references `PrState` from `pr.ts`. Mitigation: import across files via `'./pr'` — barrel only used by consumers, never internally.
- **Missed import site**: mitigated by `tsc --noEmit` which will flag every broken import.
- **Behavior change**: none expected — pure type reorganization.

## Success criteria

- `pnpm typecheck` passes.
- `pnpm lint` passes.
- `just check` passes.
- `grep -r "from '@/types/domain'"` returns nothing.
- No `export (type|interface)` outside `types/` except `Props`, hook-return aliases, store state, routing types, and local non-exported types.
