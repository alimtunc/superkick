import { projectSwitchReturnPath, sortDesktopProjects } from '@/lib/desktopProjects'
import type { DesktopProject } from '@/types'
import { describe, expect, it } from 'vitest'

function project(overrides: Partial<DesktopProject>): DesktopProject {
	return {
		id: overrides.id ?? 'id',
		name: overrides.name ?? 'Project',
		path: overrides.path ?? '/tmp/project',
		last_opened_at: overrides.last_opened_at ?? null,
		has_linear_key: overrides.has_linear_key ?? false,
		attention_count: overrides.attention_count ?? 0
	}
}

describe('desktop project ordering', () => {
	it('keeps project rail order alphabetical instead of recency-based', () => {
		const projects = [
			project({ id: 'z', name: 'Zeta', last_opened_at: '2026-06-10T22:00:00Z' }),
			project({ id: 'a', name: 'Alpha', last_opened_at: null }),
			project({ id: 'b', name: 'Beta', last_opened_at: '2026-06-10T23:00:00Z' })
		]

		expect(sortDesktopProjects(projects).map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Zeta'])
	})

	it('uses path as a stable tiebreaker for duplicate names', () => {
		const projects = [
			project({ id: 'b', name: 'App', path: '/work/b' }),
			project({ id: 'a', name: 'App', path: '/work/a' })
		]

		expect(sortDesktopProjects(projects).map((p) => p.path)).toEqual(['/work/a', '/work/b'])
	})
})

describe('project switch return path', () => {
	it('keeps collection routes with their search params', () => {
		expect(projectSwitchReturnPath('/issues', '?tab=all-open')).toBe('/issues?tab=all-open')
	})

	it('collapses project-specific issue detail routes to the issues list', () => {
		expect(projectSwitchReturnPath('/issues/SUP-123', '')).toBe('/issues')
	})

	it('collapses project-specific run and task detail routes to stable collection routes', () => {
		expect(projectSwitchReturnPath('/runs/run-123', '')).toBe('/runs')
		expect(projectSwitchReturnPath('/tasks/task-123', '')).toBe('/queue')
	})

	it('keeps global settings routes unchanged', () => {
		expect(projectSwitchReturnPath('/settings', '?pane=integrations')).toBe('/settings?pane=integrations')
	})
})
