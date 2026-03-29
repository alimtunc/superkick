import { DuplicateRunError } from '@/api'
import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueComments } from '@/components/issue-detail/IssueComments'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/useConfig'
import { useCreateRun } from '@/hooks/useCreateRun'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { IssueDetailResponse, LinkedRunSummary } from '@/types'
import { Link, useParams } from '@tanstack/react-router'

export function IssueDetailPage() {
	const { issueId } = useParams({ from: '/issues/$issueId' })
	return <IssueDetail issueId={issueId} />
}

function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading) return <p className="font-data p-6 text-dim">Loading...</p>
	if (error) return <p className="font-data p-6 text-oxide">{error}</p>
	if (!issue) return <p className="font-data p-6 text-dim">Issue not found.</p>

	return (
		<div>
			<IssueDetailHeader issue={issue} onRefresh={refresh} />
			<div className="mx-auto max-w-5xl px-5 py-6">
				<IssueMetaGrid issue={issue} />
				{issue.linked_runs.length > 0 ? <LinkedRuns runs={issue.linked_runs} /> : null}
				{issue.description ? (
					<section className="mb-6">
						<SectionTitle title="DESCRIPTION" />
						<div className="panel p-4">
							<pre className="font-data text-[12px] leading-relaxed whitespace-pre-wrap text-silver">
								{issue.description}
							</pre>
						</div>
					</section>
				) : null}
				<IssueComments comments={issue.comments} />
			</div>
		</div>
	)
}

// ── Header with Start button ──────────────────────────────────────────

function IssueDetailHeader({ issue, onRefresh }: { issue: IssueDetailResponse; onRefresh: () => void }) {
	const { config } = useConfig()
	const createRun = useCreateRun({ issueId: issue.id })
	const launchProfile = config?.launch_profile
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})

	const activeRun = issue.linked_runs.find((r) => !['completed', 'failed', 'cancelled'].includes(r.state))

	const duplicateError = createRun.error instanceof DuplicateRunError ? createRun.error : null

	const activeRunId = activeRun?.id ?? duplicateError?.activeRunId

	function handleLaunch() {
		if (!config) return
		createRun.launch({
			config,
			issueId: issue.id,
			issueIdentifier: issue.identifier,
			operatorInstructions: dialog.instructions || undefined,
			onSuccess: dialog.closeDialog
		})
	}

	const canStart = !!config?.repo_slug && !!launchProfile && !activeRun && !createRun.isPending

	return (
		<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<Link
						to="/issues"
						className="font-data text-[11px] text-dim transition-colors hover:text-silver"
					>
						&larr; ISSUES
					</Link>
					<span className="text-edge">|</span>
					<span className="font-data text-[11px] font-medium text-fog">{issue.identifier}</span>
					<span
						className="inline-block rounded px-2 py-0.5 text-[10px] font-medium"
						style={{
							color: issue.status.color,
							backgroundColor: `${issue.status.color}15`
						}}
					>
						{issue.status.name}
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					{createRun.isError && !duplicateError ? (
						<span className="font-data text-[10px] text-oxide">{createRun.error.message}</span>
					) : null}

					<Button
						variant="outline"
						size="xs"
						onClick={onRefresh}
						className="font-data text-[11px] text-dim hover:text-silver"
					>
						REFRESH
					</Button>

					<a
						href={issue.url}
						target="_blank"
						rel="noopener noreferrer"
						className="font-data inline-flex h-6 items-center rounded-md border border-edge px-2 text-[11px] text-dim transition-colors hover:border-edge-bright hover:text-silver"
					>
						LINEAR
					</a>

					<span className="mx-1 h-5 w-px bg-edge" />

					{activeRunId ? (
						<Link
							to="/runs/$runId"
							params={{ runId: activeRunId }}
							className="font-data inline-flex h-6 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
						>
							RUN ACTIVE
						</Link>
					) : (
						<Button
							size="xs"
							disabled={!canStart}
							onClick={dialog.openDialog}
							className="font-data text-[11px]"
						>
							START
						</Button>
					)}
				</div>
			</div>

			{launchProfile ? (
				<LaunchDialog
					open={dialog.open}
					profile={launchProfile}
					instructions={dialog.instructions}
					useWorktree={dialog.useWorktree}
					isPending={createRun.isPending}
					onInstructionsChange={dialog.setInstructions}
					onUseWorktreeChange={dialog.setUseWorktree}
					onLaunch={handleLaunch}
					onClose={dialog.closeDialog}
				/>
			) : null}
		</header>
	)
}

// ── Metadata grid ─────────────────────────────────────────────────────

function IssueMetaGrid({ issue }: { issue: IssueDetailResponse }) {
	const fields = [
		{ label: 'Title', value: issue.title },
		{ label: 'Priority', value: issue.priority.label },
		{ label: 'Assignee', value: issue.assignee?.name ?? '--' },
		{ label: 'Project', value: issue.project?.name ?? '--' },
		{
			label: 'Cycle',
			value: issue.cycle ? `${issue.cycle.name ?? `#${issue.cycle.number}`}` : '--'
		},
		{ label: 'Estimate', value: issue.estimate != null ? `${issue.estimate} pts` : '--' }
	]

	return (
		<div className="panel mb-6 p-4">
			<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
				{fields.map((f) => (
					<div key={f.label}>
						<dt className="font-data text-[10px] tracking-wider text-dim uppercase">{f.label}</dt>
						<dd className="font-data mt-0.5 text-[11px] text-silver">{f.value}</dd>
					</div>
				))}
			</dl>
			{issue.labels.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{issue.labels.map((l) => (
						<span
							key={l.name}
							className="inline-block rounded px-2 py-0.5 text-[10px] font-medium"
							style={{
								color: l.color,
								backgroundColor: `${l.color}15`
							}}
						>
							{l.name}
						</span>
					))}
				</div>
			) : null}
		</div>
	)
}

// ── Linked runs ───────────────────────────────────────────────────────

function LinkedRuns({ runs }: { runs: LinkedRunSummary[] }) {
	const sorted = runs.toSorted(
		(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
	)

	return (
		<section className="mb-6">
			<SectionTitle title="LINKED RUNS" count={sorted.length} />
			<div className="space-y-2">
				{sorted.map((run) => (
					<Link
						key={run.id}
						to="/runs/$runId"
						params={{ runId: run.id }}
						className="panel panel-hover flex items-center justify-between px-4 py-3"
					>
						<div className="flex items-center gap-3">
							<RunStateBadge state={run.state} />
							<span className="font-data text-[11px] text-dim">
								{new Date(run.started_at).toLocaleString()}
							</span>
						</div>
						<span className="font-data text-[10px] text-dim">
							{run.finished_at
								? `finished ${new Date(run.finished_at).toLocaleString()}`
								: 'in progress'}
						</span>
					</Link>
				))}
			</div>
		</section>
	)
}
