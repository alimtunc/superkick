import type { LaunchTaskStep } from '@/types'
import { describe, expect, it } from 'vitest'

import { deriveActivityRows, deriveChangedFiles, derivePhases } from '../executionLog'

function step(overrides: Partial<LaunchTaskStep>): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step-1',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 1,
		step_kind: overrides.step_kind ?? 'implement',
		agent_name: overrides.agent_name ?? 'fix-bot',
		provider: 'claude',
		model: null,
		mode: null,
		status: overrides.status ?? 'running',
		linked_run_id: overrides.linked_run_id ?? null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: overrides.summary ?? null,
		structured_result: overrides.structured_result ?? null,
		failure_classification: null,
		created_at: '2026-05-26T09:00:00.000Z',
		updated_at: '2026-05-26T10:00:00.000Z'
	}
}

describe('derivePhases', () => {
	it('tags meta only for active/paused phases', () => {
		const phases = derivePhases([
			step({ step_kind: 'plan', status: 'completed' }),
			step({ step_kind: 'implement', status: 'running' })
		])
		expect(phases.find((p) => p.kind === 'plan')?.meta).toBeNull()
		expect(phases.find((p) => p.kind === 'implement')?.meta).toBe('running')
		expect(phases.find((p) => p.kind === 'review')?.status).toBe('pending')
	})
})

describe('deriveActivityRows', () => {
	it('orders latest-first, drops pending steps, and maps kind by status/step_kind', () => {
		const rows = deriveActivityRows([
			step({ id: 'a', sequence: 1, step_kind: 'plan', status: 'completed', summary: 'Planned it' }),
			step({ id: 'b', sequence: 2, step_kind: 'implement', status: 'running', summary: 'Coding' }),
			step({ id: 'c', sequence: 3, step_kind: 'review', status: 'pending' })
		])
		expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
		expect(rows[0]).toMatchObject({ kind: 'edit', title: 'Coding', active: true })
		expect(rows[1]).toMatchObject({ kind: 'done', title: 'Planned it', active: false })
	})

	it('falls back to a synthesized title when a step has no summary', () => {
		const [row] = deriveActivityRows([step({ step_kind: 'review', status: 'needs_human' })])
		expect(row.kind).toBe('ask')
		expect(row.title).toBe('Review · needs you')
	})
})

describe('deriveChangedFiles', () => {
	it('dedupes file paths, marks files touched by active steps, and leaves counts null', () => {
		const files = deriveChangedFiles([
			step({
				step_kind: 'implement',
				status: 'running',
				structured_result: {
					status: 'completed',
					summary: '',
					changed_files: ['a.ts', 'b.ts'],
					questions: []
				}
			}),
			step({
				step_kind: 'review',
				status: 'completed',
				structured_result: {
					status: 'completed',
					summary: '',
					changed_files: ['b.ts', 'c.ts'],
					questions: []
				}
			})
		])
		expect(files.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
		expect(files.find((f) => f.path === 'a.ts')?.active).toBe(true)
		expect(files.find((f) => f.path === 'c.ts')?.active).toBe(false)
		expect(files[0].adds).toBeNull()
		expect(files[0].dels).toBeNull()
	})
})
