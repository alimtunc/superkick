import { useMemo } from 'react'

import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { pinClass, pinTitle } from '@/components/run-detail/pinHelpers'
import { RunStatusBanner } from '@/components/run-detail/RunStatusBanner'
import { StepTimeline } from '@/components/run-detail/StepTimeline'
import { FailureBanner } from '@/components/run-inspector/FailureBanner'
import { RunInspectorParentBanner } from '@/components/run-inspector/RunInspectorParentBanner'
import { RunInspectorRail } from '@/components/run-inspector/RunInspectorRail'
import { RunChip } from '@/components/run-shared/RunChip'
import { RunStatGrid } from '@/components/run-shared/RunStatGrid'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ExternalLink } from '@/components/ui/external-link'
import type { LoadedRunDetail } from '@/hooks/useRunDetail'
import { fmtElapsed, providerLabel, runNeedsHuman } from '@/lib/domain'
import { FEATURES } from '@/lib/features'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import { selectMaxReached, useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { AgentSession } from '@/types'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'

interface RunInspectorProps {
	detail: LoadedRunDetail
	refTime: number
}

function activeSession(sessions: AgentSession[]): AgentSession | null {
	return (
		sessions.find((s) => s.status === 'running') ??
		sessions.find((s) => s.status === 'starting') ??
		sessions[0] ??
		null
	)
}

export function RunInspector({ detail, refTime }: RunInspectorProps) {
	const {
		run,
		pr,
		steps,
		sessions,
		attentionRequests,
		isTerminal,
		refresh,
		cancelConfirm,
		setCancelConfirm,
		handleCancel,
		cancelling
	} = detail

	const needsHuman = runNeedsHuman(run, attentionRequests)
	const { isWatched, toggleWatch } = useWatchedSessionsStore()
	const maxReached = useWatchedSessionsStore(selectMaxReached)
	const watched = isWatched(run.id)
	const elapsed = fmtElapsed(run.started_at, run.finished_at ? Date.parse(run.finished_at) : refTime)

	const active = activeSession(sessions)
	const provider = active ? (providerLabel[active.provider] ?? active.provider) : null
	const isFailed = run.state === 'failed'

	const sub = useMemo(
		() => (
			<>
				<RunChip state={run.state} />
				{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
				<span className="font-data text-[11px] text-fg-dim">· {elapsed}</span>
			</>
		),
		[run.state, run.execution_mode, elapsed]
	)

	const right = useMemo(
		() => (
			<>
				{FEATURES.sessionWatchRail ? (
					<button
						type="button"
						onClick={() => toggleWatch(run.id)}
						disabled={!watched && maxReached}
						aria-label={pinTitle(watched, maxReached)}
						aria-pressed={watched}
						title={pinTitle(watched, maxReached)}
						className={`iconbtn ${pinClass(watched, maxReached)}`}
					>
						<Icon name="pin" size={16} className="ic" />
					</button>
				) : null}
				<button
					type="button"
					onClick={() => refresh()}
					aria-label="Refresh run data"
					title="Refresh run data"
					className="iconbtn"
				>
					<Icon name="loop" size={16} className="ic" />
				</button>
				{pr ? (
					<ExternalLink href={pr.url} className="btn btn--sm" aria-label={`Open PR #${pr.number}`}>
						<Icon name="external" size={14} className="ic" />#{pr.number}
					</ExternalLink>
				) : null}
				{!isTerminal ? (
					<Btn
						kind="danger"
						size="sm"
						icon="stop"
						onClick={() => setCancelConfirm(true)}
						aria-label="Cancel run"
						title="Cancel run"
					>
						Cancel
					</Btn>
				) : null}
			</>
		),
		[pr, isTerminal, watched, maxReached, run.id, toggleWatch, refresh, setCancelConfirm]
	)

	usePageActions({
		title: run.id.slice(0, 8),
		sub,
		right,
		back: <TopbarBackButton fallbackTo={run.issue_identifier ? `/issues/${run.issue_identifier}` : '/'} />
	})

	return (
		<div className="flex h-full min-h-0 flex-col">
			<RunInspectorParentBanner run={run} />
			{!isFailed ? (
				<RunStatusBanner run={run} pr={pr} isTerminal={isTerminal} needsHuman={needsHuman} />
			) : null}
			<div className="inspector">
				<div className="inspector__main">
					{isFailed ? <FailureBanner message={run.error_message} /> : null}
					<div className="mb-3 flex items-center gap-4">
						<Icon name="terminal" size={18} className="ic text-fg-muted" />
						<span className="mono text-[16px]">{run.id.slice(0, 8)}</span>
						<RunChip state={run.state} />
						{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
					</div>
					<div className="mb-5 text-[13px] text-fg-dim">
						<span className="mono">{run.issue_identifier}</span>
						{provider ? (
							<>
								{' · '}
								<span className="mono">{provider}</span>
							</>
						) : null}
					</div>

					<RunStatGrid run={run} steps={steps} refTime={refTime} />

					<div className="section-head">
						<span className="section-head__title">Step ledger</span>
						<span className="section-head__line" />
					</div>
					<StepTimeline steps={steps} />
				</div>
				<RunInspectorRail run={run} />
			</div>
			<ConfirmDialog
				open={cancelConfirm}
				onOpenChange={(open) => {
					if (!open) setCancelConfirm(false)
				}}
				title="Cancel this run?"
				description={
					<>
						<span className="font-data text-fg">{run.issue_identifier}</span> will be stopped.
						In-flight agent work is discarded, but the worktree and any committed changes are
						preserved.
					</>
				}
				confirmLabel="Cancel run"
				cancelLabel="Keep running"
				destructive
				busy={cancelling}
				onConfirm={handleCancel}
			/>
		</div>
	)
}
