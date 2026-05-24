const ISSUE_ARTIFACT = '../docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html'
const TASK_RUN_ARTIFACT = '../docs/design/issue-centered-v1/artifacts/task-and-run-rework.html'
const DRAWER_ARTIFACT = '../docs/design/issue-centered-v1/artifacts/issue-detail-with-execution-log.html'

const VIEWPORT_1280_800 = { width: 1280, height: 800 }
const VIEWPORT_1280_920 = { width: 1280, height: 920 }
const VIEWPORT_DRAWER = { width: 900, height: 900 }

export const DEFAULT_OUTPUT_DIR = '../.visual-parity-output/latest'
export const DIFF_THRESHOLD = 0.01
export const PIXELMATCH_THRESHOLD = 0.12

export const CAPTURE_STATES = [
	{
		id: 'issues-list-default',
		label: '/issues list default',
		route: '/issues',
		fixture: 'issues-default',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'list-default-dark' },
		waitFor: '[data-issue-row][data-identifier="SUP-169"]'
	},
	{
		id: 'issues-list-hover',
		label: '/issues row hover',
		route: '/issues',
		fixture: 'issues-default',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'hover-dark' },
		waitFor: '[data-issue-row][data-identifier="SUP-169"]',
		actions: [{ type: 'hoverIssue', identifier: 'SUP-169' }]
	},
	{
		id: 'issues-list-filter',
		label: '/issues filter dropdown',
		route: '/issues',
		fixture: 'issues-default',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'filter-dark' },
		waitFor: '[data-issue-row][data-identifier="SUP-169"]',
		actions: [{ type: 'clickRole', role: 'button', name: 'Filter' }]
	},
	{
		id: 'issues-list-empty',
		label: '/issues empty',
		route: '/issues',
		fixture: 'issues-empty',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'empty-dark' },
		waitForText: 'No issues yet'
	},
	{
		id: 'issues-list-shipped',
		label: '/issues recently shipped',
		route: '/issues?tab=shipped',
		fixture: 'issues-default',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'shipped-dark' },
		waitForText: 'Recently shipped'
	},
	{
		id: 'issues-kanban-default',
		label: '/issues kanban',
		route: '/issues?view=board',
		fixture: 'issues-default',
		viewport: VIEWPORT_1280_800,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'kanban-dark' },
		waitFor: '[data-issue-state="open"]'
	},
	{
		id: 'issue-detail-idle',
		label: '/issues/:id idle',
		route: '/issues/SUP-169',
		fixture: 'issue-idle',
		viewport: VIEWPORT_1280_920,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'detail-idle' },
		waitForText: 'Visual parity harness for Issue-centered V1'
	},
	{
		id: 'issue-detail-running',
		label: '/issues/:id running',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_1280_920,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'detail-running' },
		waitForText: 'Execution'
	},
	{
		id: 'issue-detail-diff',
		label: '/issues/:id diff',
		route: '/issues/SUP-169',
		fixture: 'issue-done',
		viewport: VIEWPORT_1280_920,
		mockup: { file: ISSUE_ARTIFACT, artboardId: 'detail-diff' },
		waitForText: 'Task finished'
	},
	{
		id: 'task-running',
		label: '/tasks/:id running',
		route: '/tasks/task-running',
		fixture: 'task-running',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'cockpit-running' },
		waitForText: 'Webhook signature rejection in us-east-2'
	},
	{
		id: 'task-needs-human',
		label: '/tasks/:id needs human',
		route: '/tasks/task-needs',
		fixture: 'task-needs',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'cockpit-needs' },
		waitForText: 'Approval needed before retrying webhook tests.'
	},
	{
		id: 'task-done',
		label: '/tasks/:id done',
		route: '/tasks/task-done',
		fixture: 'task-done',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'cockpit-done' },
		waitForText: 'completed'
	},
	{
		id: 'run-running',
		label: '/runs/:id running',
		route: '/runs/run-running',
		fixture: 'run-running',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'run-running' },
		waitForText: 'Decisions for this run live on its issue'
	},
	{
		id: 'run-needs-human',
		label: '/runs/:id needs human',
		route: '/runs/run-needs',
		fixture: 'run-needs',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'run-needs' },
		waitForText: 'Approval required'
	},
	{
		id: 'run-done',
		label: '/runs/:id done',
		route: '/runs/run-done',
		fixture: 'run-done',
		viewport: VIEWPORT_1280_920,
		mockup: { file: TASK_RUN_ARTIFACT, artboardId: 'run-done' },
		waitForText: 'Decisions for this run live on its issue'
	},
	{
		id: 'drawer-activity',
		label: 'execution drawer activity',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-activity' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }],
		capture: { type: 'dialog', name: 'Run' }
	},
	{
		id: 'drawer-tools',
		label: 'execution drawer tools',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-tools' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }, { type: 'clickRole', role: 'tab', name: 'Tools' }],
		capture: { type: 'dialog', name: 'Run' }
	},
	{
		id: 'drawer-files',
		label: 'execution drawer files',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-files' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }, { type: 'clickRole', role: 'tab', name: 'Files' }],
		capture: { type: 'dialog', name: 'Run' }
	},
	{
		id: 'drawer-logs',
		label: 'execution drawer logs',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-logs' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }, { type: 'clickRole', role: 'tab', name: 'Logs' }],
		capture: { type: 'dialog', name: 'Run' }
	},
	{
		id: 'drawer-terminal',
		label: 'execution drawer terminal',
		route: '/issues/SUP-169',
		fixture: 'issue-running',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-terminal' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }, { type: 'clickRole', role: 'tab', name: 'Terminal' }],
		capture: { type: 'dialog', name: 'Run' }
	},
	{
		id: 'drawer-done',
		label: 'execution drawer completed activity',
		route: '/issues/SUP-169',
		fixture: 'issue-done',
		viewport: VIEWPORT_DRAWER,
		mockup: { file: DRAWER_ARTIFACT, artboardId: 'drawer-done' },
		waitForText: 'Execution',
		actions: [{ type: 'openRunDrawer' }],
		capture: { type: 'dialog', name: 'Run' }
	}
]

export function findStates(ids) {
	if (ids.length === 0) return CAPTURE_STATES
	const byId = new Map(CAPTURE_STATES.map((state) => [state.id, state]))
	return ids.map((id) => {
		const state = byId.get(id)
		if (!state) {
			throw new Error(`Unknown visual parity state "${id}". Run with --list to see valid states.`)
		}
		return state
	})
}
