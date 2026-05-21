import type { IssueStatus, LifecycleIssueInput, LinearStateType, RunState } from '@/types'
import { describe, expect, it } from 'vitest'

import { bucketFor } from './lifecycle'

const VIEWER = 'viewer-1'

function status(stateType: LinearStateType): IssueStatus {
	return { state_type: stateType, name: stateType, color: '#000' }
}

function input(overrides: Partial<LifecycleIssueInput> = {}): LifecycleIssueInput {
	return {
		issue: { status: status('unstarted') },
		activeRun: null,
		assigneeId: null,
		...overrides
	}
}

describe('bucketFor', () => {
	it('returns needs when the active run is waiting on a human', () => {
		expect(bucketFor(input({ activeRun: { state: 'waiting_human' } }), VIEWER)).toBe('needs')
	})

	it.each<RunState>(['planning', 'coding', 'running_commands', 'reviewing'])(
		'returns active when the run state is %s',
		(state) => {
			expect(bucketFor(input({ activeRun: { state } }), VIEWER)).toBe('active')
		}
	)

	it('returns launchable when the issue is started and assigned to the viewer with no active run', () => {
		expect(bucketFor(input({ issue: { status: status('started') }, assigneeId: VIEWER }), VIEWER)).toBe(
			'launchable'
		)
	})

	it('returns open when the issue is started but assigned to someone else', () => {
		expect(bucketFor(input({ issue: { status: status('started') }, assigneeId: 'other' }), VIEWER)).toBe(
			'open'
		)
	})

	it('returns open when the issue is started but has no assignee', () => {
		expect(bucketFor(input({ issue: { status: status('started') }, assigneeId: null }), VIEWER)).toBe(
			'open'
		)
	})

	it.each<LinearStateType>(['backlog', 'unstarted'])(
		'returns open for %s linear state with no run',
		(stateType) => {
			expect(bucketFor(input({ issue: { status: status(stateType) } }), VIEWER)).toBe('open')
		}
	)

	it.each<LinearStateType>(['completed', 'canceled'])(
		'returns done for terminal linear state %s',
		(stateType) => {
			expect(bucketFor(input({ issue: { status: status(stateType) } }), VIEWER)).toBe('done')
		}
	)

	it.each<RunState>(['completed', 'failed', 'cancelled', 'opening_pr'])(
		'returns done when the run state is %s',
		(state) => {
			expect(
				bucketFor(
					input({
						issue: { status: status('started') },
						activeRun: { state },
						assigneeId: VIEWER
					}),
					VIEWER
				)
			).toBe('done')
		}
	)

	it.each<RunState>(['queued', 'preparing'])(
		'treats %s as no-active-run, so a viewer-owned started issue is launchable',
		(state) => {
			expect(
				bucketFor(
					input({
						issue: { status: status('started') },
						activeRun: { state },
						assigneeId: VIEWER
					}),
					VIEWER
				)
			).toBe('launchable')
		}
	)

	it('returns open when viewerId is null even for a viewer-style assignee', () => {
		expect(bucketFor(input({ issue: { status: status('started') }, assigneeId: VIEWER }), null)).toBe(
			'open'
		)
	})
})
