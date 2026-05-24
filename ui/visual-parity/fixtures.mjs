const FIXED_NOW = '2026-05-24T14:00:00.000Z'
const ISSUE_ID = 'issue-sup-169'
const ISSUE_IDENTIFIER = 'SUP-169'
const RUN_IDS = {
	running: 'run-7af2-1',
	needs: 'run-7af2-needs',
	done: 'run-7af2-done'
}

const status = {
	backlog: { state_type: 'backlog', name: 'Backlog', color: '#7a7770' },
	todo: { state_type: 'unstarted', name: 'Todo', color: '#b0ada6' },
	started: { state_type: 'started', name: 'In Progress', color: '#5b8ec9' },
	done: { state_type: 'completed', name: 'Done', color: '#4ea674' },
	canceled: { state_type: 'canceled', name: 'Canceled', color: '#a75d5d' }
}

const assignees = {
	alim: { id: 'viewer-alim', name: 'Alim', avatar_url: null },
	codex: { id: 'agent-codex', name: 'Codex', avatar_url: null }
}

const priorities = {
	urgent: { value: 1, label: 'Urgent' },
	high: { value: 2, label: 'High' },
	medium: { value: 3, label: 'Medium' },
	low: { value: 4, label: 'Low' }
}

const labels = {
	ui: { name: 'ui', color: '#5b8ec9' },
	tooling: { name: 'tooling', color: '#d4a04a' },
	foundations: { name: 'foundation', color: '#4ea674' }
}

const baseIssue = {
	id: ISSUE_ID,
	identifier: ISSUE_IDENTIFIER,
	title: 'Webhook signature rejection in us-east-2',
	status: status.started,
	team_id: 'team-superkick',
	priority: priorities.urgent,
	labels: [labels.ui, labels.tooling],
	assignee: assignees.alim,
	project: { name: 'Issue-centered V1' },
	parent: null,
	children: [],
	blocked_by: [],
	url: 'https://linear.app/superkick/issue/SUP-169',
	created_at: '2026-05-24T12:10:00.000Z',
	updated_at: '2026-05-24T13:58:00.000Z'
}

const issueList = [
	baseIssue,
	issue({
		id: 'issue-sup-170',
		identifier: 'SUP-170',
		title: 'Pixel parity pass: Issues list and Issue Detail',
		status: status.todo,
		priority: priorities.high,
		labels: [labels.ui],
		updated_at: '2026-05-24T13:20:00.000Z'
	}),
	issue({
		id: 'issue-sup-171',
		identifier: 'SUP-171',
		title: 'Pixel parity pass: Task, Run, and execution drawer',
		status: status.backlog,
		priority: priorities.medium,
		labels: [labels.ui],
		updated_at: '2026-05-24T11:50:00.000Z'
	}),
	issue({
		id: 'issue-sup-168',
		identifier: 'SUP-168',
		title: 'Run inspector terminal tab and compact empty states',
		status: status.done,
		priority: priorities.low,
		labels: [labels.foundations],
		updated_at: '2026-05-23T18:40:00.000Z'
	})
]

function issue(overrides) {
	return {
		...baseIssue,
		id: overrides.id,
		identifier: overrides.identifier,
		title: overrides.title,
		status: overrides.status,
		priority: overrides.priority,
		labels: overrides.labels,
		assignee: overrides.assignee ?? assignees.alim,
		project: overrides.project ?? { name: 'Issue-centered V1' },
		children: [],
		blocked_by: [],
		created_at: overrides.created_at ?? '2026-05-23T10:00:00.000Z',
		updated_at: overrides.updated_at,
		url: `https://linear.app/superkick/issue/${overrides.identifier.toLowerCase()}`
	}
}

function detailFor(runState) {
	const linked_runs =
		runState === 'idle'
			? []
			: [
					{
						id: RUN_IDS[runState],
						state:
							runState === 'done'
								? 'completed'
								: runState === 'needs'
									? 'waiting_human'
									: 'coding',
						started_at: '2026-05-24T13:35:00.000Z',
						finished_at: runState === 'done' ? '2026-05-24T13:57:00.000Z' : null,
						pr: runState === 'done' ? pullRequest(RUN_IDS.done) : undefined
					}
				]
	return {
		...baseIssue,
		description:
			'Build the screenshot workflow that compares approved Issue-centered V1 mockups against live app surfaces. Do not redesign the UI in this ticket.',
		cycle: { name: 'V1 foundations', number: 7 },
		estimate: 3,
		due_date: null,
		comments: [
			{
				id: 'comment-1',
				body: 'Keep this ticket focused on deterministic capture and review process.',
				author: assignees.alim,
				created_at: '2026-05-24T12:30:00.000Z',
				updated_at: '2026-05-24T12:30:00.000Z',
				parent_id: null
			}
		],
		linked_runs
	}
}

function launchTask(statusName, taskId) {
	const isDone = statusName === 'completed'
	const needs = statusName === 'needs_human'
	const current = needs ? 'step-implement-needs' : isDone ? null : 'step-implement-running'
	return {
		id: taskId,
		linear_issue_id: ISSUE_IDENTIFIER,
		recipe_kind: 'plan_implement_review',
		status: statusName,
		current_step_id: current,
		summary: needs
			? 'Approval needed before retrying webhook tests.'
			: 'Webhook signature rejection in us-east-2',
		created_at: '2026-05-24T13:30:00.000Z',
		updated_at: isDone ? '2026-05-24T13:58:00.000Z' : '2026-05-24T13:48:00.000Z'
	}
}

function launchSteps(taskStatus, linkedRunId) {
	const needs = taskStatus === 'needs_human'
	const done = taskStatus === 'completed'
	return [
		step({
			id: 'step-plan',
			taskId: taskIdForStatus(taskStatus),
			sequence: 1,
			kind: 'plan',
			status: 'completed',
			summary: 'Drafted 5 implementation steps and auto-approved the webhook fix plan.',
			runId: linkedRunId
		}),
		step({
			id: needs ? 'step-implement-needs' : 'step-implement-running',
			taskId: taskIdForStatus(taskStatus),
			sequence: 2,
			kind: 'implement',
			status: needs ? 'needs_human' : done ? 'completed' : 'running',
			summary: needs
				? 'Need approval before updating signature tolerance and retrying tests.'
				: done
					? 'Fixed webhook clock skew handling and added signature coverage.'
					: 'Editing internal/webhook/verify.go after reproducing Signature failure.',
			runId: linkedRunId,
			result:
				done || !needs
					? {
							status: 'completed',
							summary:
								'Webhook verification accepts bounded clock skew and reports stale signatures.',
							changed_files: ['internal/webhook/verify.go', 'tests/webhook_signature_test.go'],
							questions: []
						}
					: null
		}),
		step({
			id: 'step-review',
			taskId: taskIdForStatus(taskStatus),
			sequence: 3,
			kind: 'review',
			status: done ? 'completed' : 'pending',
			summary: done ? 'Checklist verified.' : null,
			runId: done ? linkedRunId : null
		})
	]
}

function taskIdForStatus(statusName) {
	if (statusName === 'needs_human') return 'task-needs'
	if (statusName === 'completed') return 'task-done'
	return 'task-running'
}

function step({ id, taskId, sequence, kind, status: stepStatus, summary, runId, result = null }) {
	return {
		id,
		launch_task_id: taskId,
		sequence,
		step_kind: kind,
		agent_name: kind === 'review' ? 'review-bot' : 'fix-bot',
		provider: 'claude',
		model: 'claude-sonnet-4.5',
		mode: 'semi_auto',
		status: stepStatus,
		linked_run_id: runId,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary,
		structured_result: result,
		failure_classification:
			stepStatus === 'needs_human'
				? { kind: 'agent_reported', status: 'needs_human', summary: 'Threshold confirmation needed.' }
				: null,
		created_at: '2026-05-24T13:30:00.000Z',
		updated_at: '2026-05-24T13:48:00.000Z'
	}
}

function run(id, state) {
	const finished = state === 'completed'
	return {
		id,
		issue_id: ISSUE_ID,
		issue_identifier: ISSUE_IDENTIFIER,
		repo_slug: 'superkick',
		state,
		trigger_source: 'task-7af2',
		execution_mode: 'semi_auto',
		current_step_key: finished ? null : state === 'waiting_human' ? 'await_human' : 'code',
		base_branch: 'main',
		worktree_path: '/Users/alimtunc/Developement/Side/superkick/.worktrees/run-7af2-1',
		branch_name: 'fix/webhook-skew',
		operator_instructions: 'Fix webhook signature rejection in us-east-2.',
		started_at: '2026-05-24T13:35:00.000Z',
		updated_at: finished ? '2026-05-24T13:57:00.000Z' : '2026-05-24T13:52:00.000Z',
		finished_at: finished ? '2026-05-24T13:57:00.000Z' : null,
		error_message: null,
		budget: { duration_secs: 5400, retries_max: 1, token_ceiling: null },
		pause_kind: state === 'waiting_human' ? 'approval' : 'none',
		pause_reason: state === 'waiting_human' ? 'Approve test retry after webhook skew fix.' : null
	}
}

function runSteps(runId, state) {
	return [
		runStep(runId, 'prepare', 'succeeded', 1),
		runStep(runId, 'plan', 'succeeded', 2),
		runStep(runId, 'code', state === 'completed' ? 'succeeded' : 'running', 3),
		runStep(runId, 'commands', state === 'completed' ? 'succeeded' : 'pending', 4),
		runStep(runId, 'review_swarm', state === 'completed' ? 'succeeded' : 'pending', 5)
	]
}

function runStep(runId, key, statusName, attempt) {
	return {
		id: `${runId}-${key}`,
		run_id: runId,
		step_key: key,
		status: statusName,
		attempt,
		agent_provider: 'claude',
		started_at: statusName === 'pending' ? null : '2026-05-24T13:35:00.000Z',
		finished_at: statusName === 'succeeded' ? '2026-05-24T13:45:00.000Z' : null,
		input_json: null,
		output_json: statusName === 'succeeded' ? '{"summary":"ok"}' : null,
		error_message: null
	}
}

function session(runId, statusName = 'running') {
	return {
		id: `${runId}-session`,
		run_id: runId,
		run_step_id: `${runId}-code`,
		provider: 'claude',
		command: 'claude --model sonnet-4.5',
		pid: statusName === 'running' ? 4217 : null,
		status: statusName,
		started_at: '2026-05-24T13:37:00.000Z',
		finished_at: statusName === 'completed' ? '2026-05-24T13:55:00.000Z' : null,
		exit_code: statusName === 'completed' ? 0 : null,
		linear_context_mode: 'issue',
		role: 'implement',
		purpose: 'Fix webhook signature rejection',
		parent_session_id: null,
		launch_reason: 'initial_step',
		handoff_id: null
	}
}

function attention(runId) {
	return {
		id: `${runId}-attention`,
		run_id: runId,
		kind: 'approval',
		title: 'Need operator decision',
		body: 'Approve retrying the webhook suite after updating signature clock skew handling.',
		options: ['Approve retry', 'Pause for review'],
		status: 'pending',
		reply: null,
		replied_by: null,
		created_at: '2026-05-24T13:49:00.000Z',
		replied_at: null
	}
}

function pullRequest(runId) {
	return {
		id: `${runId}-pr`,
		run_id: runId,
		number: 169,
		repo_slug: 'superkick',
		url: 'https://github.com/alimtunc/superkick/pull/169',
		state: 'open',
		title: 'Fix webhook signature clock skew handling',
		head_branch: 'fix/webhook-skew',
		created_at: '2026-05-24T13:56:00.000Z',
		updated_at: '2026-05-24T13:57:00.000Z',
		merged_at: null
	}
}

function runEvents(runId, needs = false) {
	const base = [
		timelineEvent(runId, 'operator_input', 'Received task spec from Léa M', {
			activity_kind: 'spec'
		}),
		timelineEvent(runId, 'command_output', 'grep webhook signature in internal/**', {
			activity_kind: 'search',
			detail: '4 matches · canonical:',
			file: 'internal/webhook/verify.go',
			command: 'rg "webhook signature" internal/**'
		}),
		timelineEvent(
			runId,
			'command_output',
			'go test ./internal/webhook/ -run Signature -v',
			{
				activity_kind: 'test',
				status: 'fail',
				badge: '1 fail',
				command: 'go test ./internal/webhook/ -run Signature -v',
				tests: [
					{ name: 'TestWebhookSignatureValid', result: 'pass' },
					{ name: 'TestWebhookSignatureExpired', result: 'pass' },
					{ name: 'TestWebhookSignatureDrift', result: 'fail' }
				]
			},
			'error'
		),
		timelineEvent(runId, 'agent_output', 'Wrote tests/webhook_signature_test.go', {
			activity_kind: 'write',
			file: 'tests/webhook_signature_test.go',
			changed: { added: 38, removed: 0 }
		}),
		timelineEvent(runId, 'agent_output', 'Edited internal/webhook/verify.go', {
			activity_kind: 'diff',
			file: 'internal/webhook/verify.go',
			changed: { added: 11, removed: 3 },
			snippet: [
				'- if math.Abs(float64(now-ts)) > 5 {',
				'+ skew := math.Abs(float64(now-ts))',
				'+ metrics.WebhookSkew.Observe(skew)',
				'+ if skew > clockSkewToleranceSeconds {',
				'+   return ErrSignatureTooOld',
				'  }'
			]
		}),
		timelineEvent(runId, 'step_completed', '3,419 tests passed · coverage 84.6% (+0.3%)', {
			activity_kind: 'summary',
			status: 'green',
			badge: 'green'
		}),
		timelineEvent(runId, 'step_started', 'Generating PR description…', {
			activity_kind: 'progress',
			status: 'running',
			badge: 'running',
			step_key: 'create_pr'
		}),
		timelineEvent(runId, 'session_spawned', 'Spawned implement agent', {
			role: 'implement',
			provider: 'claude',
			purpose: 'Fix webhook signature rejection',
			launch_reason: 'initial_step'
		})
	]
	if (needs) {
		base.push(
			timelineEvent(
				runId,
				'attention_requested',
				'Need operator decision',
				{ attention_request_id: `${runId}-attention` },
				'warn'
			)
		)
	}
	return base
}

function timelineEvent(runId, kind, message, payload = {}, level = 'info') {
	return {
		type: 'run_event',
		id: `${runId}-${kind}-${message.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		run_id: runId,
		run_step_id: `${runId}-code`,
		ts: '2026-05-24T13:50:00.000Z',
		kind,
		level,
		message,
		payload_json: payload
	}
}

function emptyGroups() {
	return {
		backlog: [],
		todo: [],
		launchable: [],
		waiting: [],
		blocked: [],
		active: [],
		'needs-human': [],
		'in-pr': [],
		done: []
	}
}

function queueResponse() {
	const groups = emptyGroups()
	groups.launchable = [
		{ kind: 'issue', issue: issueList[1], bucket: 'launchable', reason: 'Ready for parity pass.' }
	]
	groups.active = [
		{
			kind: 'run',
			run: run(RUN_IDS.running, 'coding'),
			linked_issue: {
				identifier: ISSUE_IDENTIFIER,
				title: baseIssue.title,
				url: baseIssue.url
			},
			bucket: 'active',
			reason: 'Visual harness implementation in progress.',
			pending_attention_count: 0,
			pending_interrupt_count: 0
		}
	]
	groups.backlog = [
		{ kind: 'issue', issue: issueList[2], bucket: 'backlog', reason: 'Blocked by harness.' }
	]
	groups.done = [
		{
			kind: 'issue',
			issue: issueList[3],
			bucket: 'done',
			reason: 'Merged in the last 7 days.'
		}
	]
	return {
		generated_at: FIXED_NOW,
		active_capacity: { current: 1, max: 3 },
		groups
	}
}

function runDetail(runId) {
	const state = runId === RUN_IDS.done ? 'completed' : runId === RUN_IDS.needs ? 'waiting_human' : 'coding'
	const needs = state === 'waiting_human'
	return {
		run: run(runId, state),
		steps: runSteps(runId, state),
		sessions: [session(runId, state === 'completed' ? 'completed' : 'running')],
		interrupts: [],
		attention_requests: needs ? [attention(runId)] : [],
		pr: state === 'completed' ? pullRequest(runId) : null
	}
}

function fixtureFor(name) {
	const empty = name === 'issues-empty'
	const taskStatus =
		name === 'task-needs' || name === 'run-needs'
			? 'needs_human'
			: name === 'task-done' || name === 'run-done' || name === 'issue-done'
				? 'completed'
				: 'running'
	const taskId = taskIdForStatus(taskStatus)
	const runId =
		name === 'run-needs' || name === 'task-needs'
			? RUN_IDS.needs
			: name === 'run-done' || name === 'task-done' || name === 'issue-done'
				? RUN_IDS.done
				: RUN_IDS.running

	return {
		now: FIXED_NOW,
		issues: empty ? [] : issueList,
		issueDetail: detailFor(name === 'issue-idle' ? 'idle' : name === 'issue-done' ? 'done' : 'running'),
		queue: empty
			? { generated_at: FIXED_NOW, active_capacity: { current: 0, max: 3 }, groups: emptyGroups() }
			: queueResponse(),
		task: launchTask(taskStatus, taskId),
		taskSteps: launchSteps(taskStatus, runId),
		runDetail: runDetail(runId),
		events: runEvents(runId, name === 'run-needs' || name === 'task-needs')
	}
}

export function responseForFixture(fixtureName, requestUrl) {
	const fixture = fixtureFor(fixtureName)
	const url = new URL(requestUrl)
	const path = url.pathname.replace(/^\/api/, '')
	const taskMatch = path.match(/^\/launch-tasks\/([^/]+)(?:\/(steps|interventions))?$/)
	const runMatch = path.match(/^\/runs\/([^/]+)$/)

	if (path === '/me') return { id: assignees.alim.id, name: assignees.alim.name, avatar_url: null }
	if (path === '/config') {
		return {
			repo_slug: 'superkick',
			base_branch: 'main',
			launch_profile: {
				use_worktree: true,
				live_mode: false,
				skills: ['ticket-triage', 'ticket-execute'],
				default_instructions: '',
				handoff_instructions: ''
			}
		}
	}
	if (path === '/agents') return { agents: [] }
	if (path === '/issues') return { issues: fixture.issues, total_count: fixture.issues.length }
	if (path === `/issues/${ISSUE_IDENTIFIER}`) return fixture.issueDetail
	if (path === `/issues/${ISSUE_IDENTIFIER}/context`) return workspaceContext()
	if (path === `/issues/${ISSUE_IDENTIFIER}/context/memory`) return memoryEntries()
	if (path === '/launch-queue') return fixture.queue
	if (path === '/runs') return [fixture.runDetail.run]
	if (path === '/events') return sse('workspace_event', fixture.events)
	if (path === '/launch-tasks/events') return sse('done', [])
	if (path === '/launch-tasks' && url.searchParams.get('linear_issue_id') === ISSUE_IDENTIFIER) {
		return [fixture.task]
	}
	if (taskMatch) {
		if (taskMatch[2] === 'steps') return fixture.taskSteps
		if (taskMatch[2] === 'interventions') return []
		return fixture.task
	}
	if (runMatch) return fixture.runDetail
	if (path.endsWith('/terminal-history')) return 'visual parity terminal fixture\n$ pnpm visual:parity\n'
	if (path.endsWith('/terminal-takeover/modes')) return { modes: [] }
	if (path.endsWith('/takeovers')) return { takeovers: [] }
	return null
}

function workspaceContext() {
	return {
		snapshot: {
			id: ISSUE_ID,
			identifier: ISSUE_IDENTIFIER,
			title: baseIssue.title,
			description: 'Visual parity harness source issue.',
			status_name: 'In Progress',
			captured_at: '2026-05-24T13:20:00.000Z'
		},
		comment_excerpts: [
			{
				id: 'ctx-comment-1',
				author: 'Alim',
				text: 'Keep this ticket focused on deterministic capture and review process.',
				captured_at: '2026-05-24T13:20:00.000Z'
			}
		],
		linked_items: [
			{ kind: 'launch_task', id: 'task-running', captured_at: '2026-05-24T13:35:00.000Z' },
			{ kind: 'run', id: RUN_IDS.running, captured_at: '2026-05-24T13:35:00.000Z' }
		]
	}
}

function memoryEntries() {
	return {
		entries: [
			{
				id: 'memory-1',
				role: 'plan',
				author: 'codex',
				text: 'Capture mockup, app, and diff artifacts for the approved Issue-centered V1 states.',
				created_at: '2026-05-24T13:32:00.000Z'
			},
			{
				id: 'memory-2',
				role: 'fact',
				author: 'codex',
				text: 'Archived HTML files are read-only and remain the source for approved mockups.',
				created_at: '2026-05-24T13:33:00.000Z'
			}
		],
		next_cursor: null
	}
}

function sse(eventName, events) {
	const body = events
		.map((entry) => `retry: 60000\nevent: ${eventName}\ndata: ${JSON.stringify(entry)}\n\n`)
		.join('')
	return {
		body: body || 'retry: 60000\nevent: done\ndata: {}\n\n',
		contentType: 'text/event-stream'
	}
}
