# UI Architecture Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the UI codebase for clearer component grouping, cleaner type exports, and consolidated lib utilities.

**Architecture:** Pure file reorganization — no logic changes, no new features. Move components by page affinity, consolidate fragmented lib files into `lib/domain.ts`, fix broken type barrel, extract pure functions from `useDashboardRuns`. Verify everything compiles after each task.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router/Query, Zustand, Tailwind CSS

---

## File Structure

### Files to create
- `ui/src/components/run-detail/EventStream.tsx` (moved)
- `ui/src/components/run-detail/InterruptPanel.tsx` (moved)
- `ui/src/components/run-detail/ReviewResults.tsx` (moved)
- `ui/src/components/run-detail/RunDetailHeader.tsx` (moved)
- `ui/src/components/run-detail/RunDetailsGrid.tsx` (moved)
- `ui/src/components/run-detail/StepTimeline.tsx` (moved)
- `ui/src/lib/domain.ts` (consolidated from health + labels + formatters + parsers + dashboard/utils)

### Files to delete
- `ui/src/types.ts` (broken barrel)
- `ui/src/types/props.ts` (referenced but doesn't exist — no action needed)
- `ui/src/lib/health.ts` (merged into domain.ts)
- `ui/src/lib/labels.ts` (merged into domain.ts)
- `ui/src/lib/formatters.ts` (merged into domain.ts)
- `ui/src/lib/parsers.ts` (merged into domain.ts)
- `ui/src/components/dashboard/utils.ts` (merged into domain.ts)
- `ui/src/components/EventStream.tsx` (moved)
- `ui/src/components/InterruptPanel.tsx` (moved)
- `ui/src/components/ReviewResults.tsx` (moved)
- `ui/src/components/RunDetailHeader.tsx` (moved)
- `ui/src/components/RunDetailsGrid.tsx` (moved)
- `ui/src/components/StepTimeline.tsx` (moved)

### Files to modify (import updates only)
- `ui/src/pages/RunDetail.tsx`
- `ui/src/pages/ControlCenter.tsx`
- `ui/src/hooks/useDashboardRuns.ts`
- `ui/src/hooks/useRunDetail.ts`
- `ui/src/components/dashboard/BoardCol.tsx`
- `ui/src/components/dashboard/AlertRow.tsx`
- `ui/src/components/dashboard/FocusedRunPanel.tsx`
- `ui/src/components/dashboard/WatchChip.tsx`
- `ui/src/components/dashboard/CompletedTable.tsx`
- `ui/src/components/dashboard/ReliabilityPanel.tsx`
- `ui/src/components/dashboard/TopBar.tsx` (no lib import changes needed)
- `ui/src/components/RunStateBadge.tsx`

### Files unchanged
- `ui/src/components/ui/*` — design system primitives
- `ui/src/components/ErrorBoundary.tsx` — app-level, stays at root
- `ui/src/components/RunStateBadge.tsx` — shared by both pages, stays at root (import update only)
- `ui/src/components/dashboard/SessionWatchRail.tsx` — shared, stays in dashboard (used by both pages)
- `ui/src/components/dashboard/SectionTitle.tsx` — shared, stays in dashboard (used by both pages)
- `ui/src/stores/*`, `ui/src/api.ts`, `ui/src/router.tsx`, `ui/src/main.tsx`, `ui/src/App.tsx`
- `ui/src/lib/utils.ts` — cn() utility for shadcn
- `ui/src/lib/constants.ts` — stays separate (pure config, no domain logic)
- `ui/src/lib/queryKeys.ts` — stays separate (React Query concern)

---

### Task 1: Fix broken type barrel

**Files:**
- Delete: `ui/src/types.ts`
- Verify: `ui/src/types/index.ts` (already correct, re-exports domain)
- Modify: `ui/src/components/StepTimeline.tsx` (uses relative `../types` import)
- Modify: `ui/src/components/ReviewResults.tsx` (uses relative `../types` import)

Currently `types.ts` at root re-exports `./types/domain` and `./types/props` (which doesn't exist). All files import from `@/types` which resolves to `types/index.ts` — except two files that use `../types` (relative to `components/`), which resolves to the broken root `types.ts`.

- [ ] **Step 1: Fix relative imports in StepTimeline.tsx**

In `ui/src/components/StepTimeline.tsx`, change line 1:
```typescript
// FROM:
import type { RunStep, StepStatus } from "../types";
// TO:
import type { RunStep, StepStatus } from "@/types";
```

- [ ] **Step 2: Fix relative imports in ReviewResults.tsx**

In `ui/src/components/ReviewResults.tsx`, change line 1:
```typescript
// FROM:
import type { RunStep, ReviewSwarmResult } from "../types";
// TO:
import type { RunStep, ReviewSwarmResult } from "@/types";
```

- [ ] **Step 3: Delete root types.ts**

```bash
rm ui/src/types.ts
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd ui && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/types.ts ui/src/components/StepTimeline.tsx ui/src/components/ReviewResults.tsx
git commit -m "fix: remove broken types.ts barrel, use @/types everywhere"
```

---

### Task 2: Consolidate lib files into domain.ts

**Files:**
- Create: `ui/src/lib/domain.ts`
- Delete: `ui/src/lib/health.ts`, `ui/src/lib/labels.ts`, `ui/src/lib/formatters.ts`, `ui/src/lib/parsers.ts`
- Delete: `ui/src/components/dashboard/utils.ts`
- Modify: all files that import from these (see import map below)

Merge `health.ts` + `labels.ts` + `formatters.ts` + `parsers.ts` + `dashboard/utils.ts` into a single `lib/domain.ts`. Also extract `classifyRuns` and metric helpers from `useDashboardRuns.ts` into `domain.ts`.

- [ ] **Step 1: Create lib/domain.ts**

Create `ui/src/lib/domain.ts` with this content — all functions and exports from the 5 source files, plus `classifyRuns` extracted from `useDashboardRuns.ts`:

```typescript
import type { Run, RunState } from "@/types";
import { AGING_THRESHOLD_MS, HEALTH_WARNING_THRESHOLD_MS } from "./constants";

// ── Formatters ────────────────────────────────────────────────────────

export function fmtDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function avgDuration(runs: Run[]): string {
  const finished = runs.filter((r) => r.finished_at);
  if (finished.length === 0) return "--";
  const avg =
    finished.reduce(
      (s, r) => s + (new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime()),
      0,
    ) / finished.length;
  return fmtDuration(avg);
}

export function medianDuration(runs: Run[]): string {
  const ds = runs
    .filter((r) => r.finished_at)
    .map((r) => new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime())
    .sort((a, b) => a - b);
  if (ds.length === 0) return "--";
  const mid = Math.floor(ds.length / 2);
  const ms = ds.length % 2 === 0 ? (ds[mid - 1] + ds[mid]) / 2 : ds[mid];
  return fmtDuration(ms);
}

export function elapsedMs(startedAt: string, refTime: number): number {
  return refTime - new Date(startedAt).getTime();
}

export function fmtElapsed(startedAt: string, refTime: number): string {
  const ms = elapsedMs(startedAt, refTime);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

// ── Labels & colors ───────────────────────────────────────────────────

export const stepLabel: Record<string, string> = {
  prepare: "Prepare",
  plan: "Plan",
  code: "Code",
  commands: "Commands",
  review_swarm: "Review",
  create_pr: "PR",
  await_human: "Human",
};

export const stateIcon: Partial<Record<RunState, string>> = {
  coding: "01",
  planning: "02",
  reviewing: "03",
  running_commands: "04",
  preparing: "05",
  opening_pr: "06",
  waiting_human: "!!",
  queued: "--",
  completed: "OK",
  failed: "XX",
  cancelled: "~~",
};

export const stateBgColor: Record<RunState, string> = {
  queued: "bg-dim",
  preparing: "bg-cyan",
  planning: "bg-cyan",
  coding: "bg-neon-green",
  running_commands: "bg-neon-green",
  reviewing: "bg-violet",
  waiting_human: "bg-gold",
  opening_pr: "bg-mineral",
  completed: "bg-mineral",
  failed: "bg-oxide",
  cancelled: "bg-dim",
};

export const stateTextColor: Record<RunState, string> = {
  queued: "text-dim",
  preparing: "text-cyan",
  planning: "text-cyan",
  coding: "text-neon-green",
  running_commands: "text-neon-green",
  reviewing: "text-violet",
  waiting_human: "text-gold",
  opening_pr: "text-mineral",
  completed: "text-mineral",
  failed: "text-oxide",
  cancelled: "text-dim",
};

export const stateBadgeStyle: Record<RunState, string> = {
  queued: "text-dim bg-dim/10",
  preparing: "text-cyan bg-cyan-dim",
  planning: "text-cyan bg-cyan-dim",
  coding: "text-neon-green bg-mineral-dim",
  running_commands: "text-neon-green bg-mineral-dim",
  reviewing: "text-violet bg-violet-dim",
  waiting_human: "text-gold bg-gold-dim",
  opening_pr: "text-mineral bg-mineral-dim",
  completed: "text-mineral bg-mineral-dim",
  failed: "text-oxide bg-oxide-dim",
  cancelled: "text-dim bg-dim/10",
};

// ── Distribution ──────────────────────────────────────────────────────

export interface DistItem {
  label: string;
  count: number;
  color: string;
}

export function stateDistribution(runs: Run[]): DistItem[] {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.state, (counts.get(run.state) ?? 0) + 1);

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label: label.replace(/_/g, " "),
      count,
      color: stateBgColor[label as RunState] ?? "bg-dim",
    }));
}

// ── Health ─────────────────────────────────────────────────────────────

export function healthSignal(run: Run, refTime: number): "critical" | "warning" | "ok" {
  if (run.state === "waiting_human" || run.state === "failed") return "critical";
  if (elapsedMs(run.started_at, refTime) > HEALTH_WARNING_THRESHOLD_MS) return "warning";
  return "ok";
}

export function shouldShowInterrupts(state: RunState, interruptCount: number): boolean {
  return interruptCount > 0 || state === "waiting_human";
}

// ── Parsers ───────────────────────────────────────────────────────────

export function extractFormError(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  return (err as { form?: string }).form ?? null;
}

export function parseAnswer(json: unknown): { action?: string; note?: string } | null {
  if (json == null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  return {
    action: typeof obj.action === "string" ? obj.action : undefined,
    note: typeof obj.note === "string" ? obj.note : undefined,
  };
}

// ── Watch button helpers ──────────────────────────────────────────────

export function watchButtonClass(watched: boolean, maxReached: boolean): string {
  if (watched) return "text-mineral hover:text-oxide";
  if (maxReached) return "text-dim/30 cursor-not-allowed";
  return "text-dim hover:text-mineral opacity-0 group-hover:opacity-100";
}

export function watchButtonTitle(watched: boolean, maxReached: boolean): string {
  if (watched) return "Unwatch";
  if (maxReached) return "Max 5 watched";
  return "Watch this run";
}

// ── Run classification (extracted from useDashboardRuns) ──────────────

const ACTIVE_STATES = new Set<RunState>([
  "queued",
  "preparing",
  "planning",
  "coding",
  "running_commands",
  "reviewing",
  "waiting_human",
  "opening_pr",
]);
const IN_PROGRESS_STATES = new Set<RunState>([
  "preparing",
  "planning",
  "coding",
  "running_commands",
  "reviewing",
  "opening_pr",
]);

export interface ClassifiedRuns {
  active: Run[];
  completed: Run[];
  failed: Run[];
  cancelled: Run[];
  terminal: Run[];
  waitingHuman: Run[];
  needsAttention: Run[];
  reviewing: Run[];
  openingPr: Run[];
  inProgress: Run[];
  queued: Run[];
}

export function classifyRuns(runs: Run[]): ClassifiedRuns {
  const result: ClassifiedRuns = {
    active: [],
    completed: [],
    failed: [],
    cancelled: [],
    terminal: [],
    waitingHuman: [],
    needsAttention: [],
    reviewing: [],
    openingPr: [],
    inProgress: [],
    queued: [],
  };

  for (const r of runs) {
    if (ACTIVE_STATES.has(r.state)) result.active.push(r);
    if (TERMINAL_STATES.has(r.state)) result.terminal.push(r);
    if (IN_PROGRESS_STATES.has(r.state)) result.inProgress.push(r);

    switch (r.state) {
      case "completed":
        result.completed.push(r);
        break;
      case "failed":
        result.failed.push(r);
        result.needsAttention.push(r);
        break;
      case "cancelled":
        result.cancelled.push(r);
        break;
      case "waiting_human":
        result.waitingHuman.push(r);
        result.needsAttention.push(r);
        break;
      case "reviewing":
        result.reviewing.push(r);
        break;
      case "opening_pr":
        result.openingPr.push(r);
        break;
      case "queued":
        result.queued.push(r);
        break;
    }
  }

  return result;
}
```

Note: `TERMINAL_STATES` is imported from `./constants` (it stays there since it's pure config).

- [ ] **Step 2: Update useDashboardRuns.ts**

Replace the entire file with a slim hook that imports from `@/lib/domain`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRuns } from "@/api";
import { AGING_THRESHOLD_MS } from "@/lib/constants";
import { classifyRuns, elapsedMs, fmtElapsed } from "@/lib/domain";
import { queryKeys } from "@/lib/queryKeys";

export function useDashboardRuns() {
  const {
    data: runs = [],
    isLoading: loading,
    error: queryError,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: queryKeys.runs.all,
    queryFn: fetchRuns,
    refetchInterval: 15_000,
  });

  const error = queryError ? String(queryError) : null;
  const refTime = useMemo(() => dataUpdatedAt || Date.now(), [dataUpdatedAt]);
  const lastRefresh = useMemo(() => new Date(dataUpdatedAt || Date.now()), [dataUpdatedAt]);
  const classified = useMemo(() => classifyRuns(runs), [runs]);

  const successRate =
    classified.terminal.length > 0
      ? Math.round((classified.completed.length / classified.terminal.length) * 100)
      : null;

  const aging = useMemo(
    () =>
      classified.active.filter(
        (r) =>
          elapsedMs(r.started_at, refTime) > AGING_THRESHOLD_MS &&
          r.state !== "waiting_human" &&
          r.state !== "failed",
      ),
    [classified.active, refTime],
  );

  const oldestActive = useMemo(() => {
    if (classified.active.length === 0) return "--";
    const oldest = classified.active.reduce((a, b) =>
      new Date(a.started_at).getTime() < new Date(b.started_at).getTime() ? a : b,
    );
    return fmtElapsed(oldest.started_at, refTime);
  }, [classified.active, refTime]);

  return {
    runs,
    loading,
    error,
    lastRefresh,
    refTime,
    refresh: refetch,
    ...classified,
    successRate,
    aging,
    oldestActive,
  };
}

export type DashboardData = ReturnType<typeof useDashboardRuns>;
```

- [ ] **Step 3: Update useRunDetail.ts imports**

Change:
```typescript
// FROM:
import { TERMINAL_STATES } from "@/lib/constants";
import { shouldShowInterrupts } from "@/lib/health";
// TO:
import { TERMINAL_STATES } from "@/lib/constants";
import { shouldShowInterrupts } from "@/lib/domain";
```

- [ ] **Step 4: Update ControlCenter.tsx imports**

Change:
```typescript
// FROM:
import { avgDuration, medianDuration } from "@/lib/formatters";
import { stateDistribution } from "@/lib/labels";
// TO:
import { avgDuration, medianDuration, stateDistribution } from "@/lib/domain";
```

- [ ] **Step 5: Update RunStateBadge.tsx imports**

Change:
```typescript
// FROM:
import { stateBadgeStyle } from "@/lib/labels";
// TO:
import { stateBadgeStyle } from "@/lib/domain";
```

- [ ] **Step 6: Update InterruptPanel.tsx imports**

Change:
```typescript
// FROM:
import { extractFormError, parseAnswer } from "@/lib/parsers";
// TO:
import { extractFormError, parseAnswer } from "@/lib/domain";
```

- [ ] **Step 7: Update StepTimeline.tsx imports**

Change:
```typescript
// FROM:
import { fmtDuration } from "@/lib/formatters";
// TO:
import { fmtDuration } from "@/lib/domain";
```

- [ ] **Step 8: Update BoardCol.tsx imports**

Change:
```typescript
// FROM:
import { fmtElapsed } from "@/lib/formatters";
import { healthSignal } from "@/lib/health";
import { stepLabel, stateIcon } from "@/lib/labels";
import { watchButtonClass, watchButtonTitle } from "./utils";
// TO:
import { fmtElapsed, healthSignal, stepLabel, stateIcon, watchButtonClass, watchButtonTitle } from "@/lib/domain";
```

- [ ] **Step 9: Update AlertRow.tsx imports**

Change:
```typescript
// FROM:
import { fmtElapsed } from "@/lib/formatters";
import { watchButtonClass } from "./utils";
// TO:
import { fmtElapsed, watchButtonClass } from "@/lib/domain";
```

- [ ] **Step 10: Update FocusedRunPanel.tsx imports**

Change:
```typescript
// FROM:
import { fmtElapsed } from "@/lib/formatters";
import { TERMINAL_STATES } from "@/lib/constants";
// TO:
import { fmtElapsed } from "@/lib/domain";
import { TERMINAL_STATES } from "@/lib/constants";
```

- [ ] **Step 11: Update WatchChip.tsx imports**

Change:
```typescript
// FROM:
import { fmtElapsed } from "@/lib/formatters";
import { healthSignal } from "@/lib/health";
import { stepLabel } from "@/lib/labels";
// TO:
import { fmtElapsed, healthSignal, stepLabel } from "@/lib/domain";
```

- [ ] **Step 12: Update CompletedTable.tsx imports**

Change:
```typescript
// FROM:
import { fmtDuration } from "@/lib/formatters";
// TO:
import { fmtDuration } from "@/lib/domain";
```

- [ ] **Step 13: Update ReliabilityPanel.tsx imports**

Change:
```typescript
// FROM:
import type { DistItem } from "@/lib/labels";
// TO:
import type { DistItem } from "@/lib/domain";
```

- [ ] **Step 14: Delete old files**

```bash
rm ui/src/lib/health.ts ui/src/lib/labels.ts ui/src/lib/formatters.ts ui/src/lib/parsers.ts ui/src/components/dashboard/utils.ts
```

- [ ] **Step 15: Verify TypeScript compiles**

```bash
cd ui && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 16: Commit**

```bash
git add -A ui/src/lib/ ui/src/hooks/useDashboardRuns.ts ui/src/pages/ ui/src/components/
git commit -m "refactor: consolidate lib files into domain.ts, extract classifyRuns from hook"
```

---

### Task 3: Move RunDetail components into run-detail/ directory

**Files:**
- Create directory: `ui/src/components/run-detail/`
- Move: `EventStream.tsx`, `InterruptPanel.tsx`, `ReviewResults.tsx`, `RunDetailHeader.tsx`, `RunDetailsGrid.tsx`, `StepTimeline.tsx`
- Modify: `ui/src/pages/RunDetail.tsx` (update imports)

These 6 components are only used by the RunDetail page. Moving them into their own directory mirrors the existing `dashboard/` grouping.

- [ ] **Step 1: Create directory and move files**

```bash
mkdir -p ui/src/components/run-detail
mv ui/src/components/EventStream.tsx ui/src/components/run-detail/
mv ui/src/components/InterruptPanel.tsx ui/src/components/run-detail/
mv ui/src/components/ReviewResults.tsx ui/src/components/run-detail/
mv ui/src/components/RunDetailHeader.tsx ui/src/components/run-detail/
mv ui/src/components/RunDetailsGrid.tsx ui/src/components/run-detail/
mv ui/src/components/StepTimeline.tsx ui/src/components/run-detail/
```

- [ ] **Step 2: Update RunDetail.tsx imports**

Change:
```typescript
// FROM:
import { EventStream } from "@/components/EventStream";
import { InterruptPanel } from "@/components/InterruptPanel";
import { ReviewResults } from "@/components/ReviewResults";
import { RunDetailHeader } from "@/components/RunDetailHeader";
import { RunDetailsGrid } from "@/components/RunDetailsGrid";
import { StepTimeline } from "@/components/StepTimeline";
// TO:
import { EventStream } from "@/components/run-detail/EventStream";
import { InterruptPanel } from "@/components/run-detail/InterruptPanel";
import { ReviewResults } from "@/components/run-detail/ReviewResults";
import { RunDetailHeader } from "@/components/run-detail/RunDetailHeader";
import { RunDetailsGrid } from "@/components/run-detail/RunDetailsGrid";
import { StepTimeline } from "@/components/run-detail/StepTimeline";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ui && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify dev server starts**

```bash
cd ui && npx vite build
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/run-detail/ ui/src/components/EventStream.tsx ui/src/components/InterruptPanel.tsx ui/src/components/ReviewResults.tsx ui/src/components/RunDetailHeader.tsx ui/src/components/RunDetailsGrid.tsx ui/src/components/StepTimeline.tsx ui/src/pages/RunDetail.tsx
git commit -m "refactor: group RunDetail components into run-detail/ directory"
```

---

## Final structure after refactor

```
ui/src/
├── components/
│   ├── ui/                    # design system primitives
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── field.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── separator.tsx
│   │   └── table.tsx
│   ├── dashboard/             # ControlCenter-specific
│   │   ├── AlertRow.tsx
│   │   ├── BoardCol.tsx
│   │   ├── CompletedTable.tsx
│   │   ├── FocusedRunPanel.tsx
│   │   ├── MetricCards.tsx
│   │   ├── ReliabilityPanel.tsx
│   │   ├── SectionTitle.tsx     (shared — also used by RunDetail)
│   │   ├── SessionWatchRail.tsx (shared — also used by RunDetail)
│   │   ├── TopBar.tsx
│   │   └── WatchChip.tsx
│   ├── run-detail/            # RunDetail-specific
│   │   ├── EventStream.tsx
│   │   ├── InterruptPanel.tsx
│   │   ├── ReviewResults.tsx
│   │   ├── RunDetailHeader.tsx
│   │   ├── RunDetailsGrid.tsx
│   │   └── StepTimeline.tsx
│   ├── ErrorBoundary.tsx       # app-level
│   └── RunStateBadge.tsx       # shared
├── hooks/
│   ├── useDashboardRuns.ts     # slim hook (logic extracted to domain.ts)
│   ├── useEventStream.ts
│   ├── useInterruptForm.ts
│   └── useRunDetail.ts
├── lib/
│   ├── constants.ts            # thresholds, terminal states
│   ├── domain.ts               # all domain logic (formatters, labels, health, parsers, classify)
│   ├── queryKeys.ts            # React Query keys
│   └── utils.ts                # cn() for shadcn
├── pages/
│   ├── ControlCenter.tsx
│   └── RunDetail.tsx
├── stores/
│   └── watchedSessions.ts
├── types/
│   ├── domain.ts
│   └── index.ts
└── (api.ts, router.tsx, main.tsx, App.tsx, index.css)
```
