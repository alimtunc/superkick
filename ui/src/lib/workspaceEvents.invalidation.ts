import { isLaunchTaskForIssueKey, queryKeys } from '@/lib/queryKeys'
import type { BrokerNotice, LaunchTaskBrokerNotice, RunEvent } from '@/types'
import type { QueryClient } from '@tanstack/react-query'

/**
 * Event kinds that can shift a run into a different operator queue bucket
 * (SUP-58). Narrower than `RUN_DETAIL_INVALIDATING_KINDS` because step
 * progress within the same state doesn't move a run between columns.
 */
const QUEUE_INVALIDATING_KINDS: ReadonlySet<RunEvent['kind']> = new Set([
	'state_change',
	'interrupt_created',
	'interrupt_resolved',
	'attention_requested',
	'attention_replied',
	'attention_cancelled',
	'ownership_suspended',
	'ownership_resumed',
	'ownership_taken_over',
	'ownership_released',
	'handoff_created',
	'handoff_completed',
	'handoff_failed'
])

/**
 * Kinds that indicate state mutations the run detail query cares about.
 * Superset of `QUEUE_INVALIDATING_KINDS`: every bucket-shifting signal is also
 * relevant to the detail view, plus per-step progress and session lifecycle
 * events that don't move a run between columns. Kept narrow so we don't
 * invalidate on every `agent_output` line — that would defeat the cache.
 */
const RUN_DETAIL_INVALIDATING_KINDS: ReadonlySet<RunEvent['kind']> = new Set<RunEvent['kind']>([
	...QUEUE_INVALIDATING_KINDS,
	'step_started',
	'step_completed',
	'step_failed',
	'review_completed',
	'session_spawned',
	'session_completed',
	'session_failed',
	'session_cancelled',
	'terminal_takeover_opened',
	'terminal_takeover_closed'
])

/**
 * Apply workspace-event invalidation: which TanStack Query keys go stale for
 * which broker notice. Extracted from the provider so the routing logic can be
 * read (and tested) without a React tree.
 */
export function invalidateForWorkspaceNotice(queryClient: QueryClient, notice: BrokerNotice): void {
	if (notice.type === 'lagged') {
		// We missed events — any cached run detail might be stale.
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		return
	}

	if (notice.type === 'run_event') {
		if (RUN_DETAIL_INVALIDATING_KINDS.has(notice.kind)) {
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(notice.run_id) })
		}
		if (QUEUE_INVALIDATING_KINDS.has(notice.kind)) {
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		}
		if (notice.kind === 'state_change') {
			// A run transitioned — the runs list state (and any dashboard summary)
			// needs a refresh. The linked-runs slice embedded in `issues.detail`
			// also reflects this transition (e.g. NeedsHumanBanner flipping on
			// `waiting_human`), so mark every cached issue stale.
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
		}
		return
	}

	if (notice.type === 'session_lifecycle') {
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(notice.run_id) })
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		return
	}

	// SUP-73 — recovery scheduler annotated a run as stalled or recovered.
	// Refresh the queue (badge in/out on the card) AND the detail view (RunDetail
	// surfaces the same annotation, and the operator may be staring at it when
	// the transition fires).
	if (notice.type === 'run_stalled' || notice.type === 'run_recovered') {
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(notice.run_id) })
		return
	}

	if (notice.type === 'memory_appended') {
		queryClient.invalidateQueries({ queryKey: queryKeys.issues.memory(notice.issue_id) })
		return
	}

	if (notice.type === 'context_updated') {
		queryClient.invalidateQueries({ queryKey: queryKeys.issues.workspaceContext(notice.issue_id) })
	}
}

/**
 * Apply launch-task invalidation. Routing mirrors the Rust enum on
 * `superkick_runtime::LaunchTaskEvent` — a new variant lands as a type error
 * here instead of silently falling through.
 */
export function invalidateForLaunchTaskNotice(
	queryClient: QueryClient,
	notice: LaunchTaskBrokerNotice
): void {
	// `LaunchTaskEvent` uses `kind` as its discriminant; `LaggedNotice` uses
	// `type`. Narrow via `in` so both code paths typecheck against the union.
	if (!('kind' in notice)) {
		queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.all })
		queryClient.invalidateQueries({
			predicate: (q) => isLaunchTaskForIssueKey(q.queryKey)
		})
		queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
		return
	}

	switch (notice.kind) {
		case 'task_status_changed':
		case 'step_started':
		case 'step_finished':
			queryClient.invalidateQueries({
				queryKey: queryKeys.launchTasks.forIssue(notice.linear_issue_id)
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.launchTasks.detail(notice.task_id)
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.launchTasks.steps(notice.task_id)
			})
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
			return
		case 'shadow_run_state_changed':
			// Shadow runs change state via direct field writes that bypass the
			// workspace event bus; this dedicated event is the only signal that
			// `linked_runs` on the issue (and `/runs/<id>` detail) need a refresh
			// between `StepStarted`/`StepFinished` pulses.
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(notice.run_id) })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
			return
		default: {
			const _exhaustive: never = notice
			return _exhaustive
		}
	}
}
