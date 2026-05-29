import type { ReactNode } from 'react'

import { CopyValue } from '@/components/run-detail/CopyValue'
import { fmtRelativeTime, fmtSecondsVerbose } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { Run } from '@/types'

interface RunInspectorRailProps {
	run: Run
}

function RailGroup({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="rail__group">
			<div className="mb-4 text-[11px] font-semibold tracking-wide text-fg-dim uppercase">{label}</div>
			{children}
		</div>
	)
}

function Prop({ k, children }: { k: string; children: ReactNode }) {
	return (
		<div className="prop">
			<span className="prop__k">{k}</span>
			<span className="prop__v mono truncate text-[12px]">{children}</span>
		</div>
	)
}

function formatTokenCeiling(value: number | null): string {
	if (value === null) return 'none'
	return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
}

export function RunInspectorRail({ run }: RunInspectorRailProps) {
	const worktree = run.worktree_path ? middleTruncate(run.worktree_path, WORKTREE_PATH_MAX) : null
	const { budget } = run

	return (
		<div className="inspector__side">
			<RailGroup label="Run">
				<Prop k="Issue">{run.issue_identifier}</Prop>
				<Prop k="Repo">{run.repo_slug}</Prop>
				<Prop k="Base">{run.base_branch ?? 'main'}</Prop>
				<Prop k="Branch">
					{run.branch_name ? (
						<CopyValue value={run.branch_name} display={run.branch_name} hideIcon />
					) : (
						<span className="text-fg-faint">not set</span>
					)}
				</Prop>
				<Prop k="Worktree">
					{run.worktree_path && worktree ? (
						<CopyValue value={run.worktree_path} display={worktree} hideIcon />
					) : (
						<span className="text-fg-faint">not attached</span>
					)}
				</Prop>
				<Prop k="Trigger">{run.trigger_source}</Prop>
			</RailGroup>

			<RailGroup label="Budget">
				<Prop k="Duration">
					{budget.duration_secs !== null
						? `${fmtSecondsVerbose(budget.duration_secs)} cap`
						: 'none'}
				</Prop>
				<Prop k="Token ceiling">{formatTokenCeiling(budget.token_ceiling)}</Prop>
				<Prop k="Retries">{budget.retries_max !== null ? `0 / ${budget.retries_max}` : 'none'}</Prop>
				<Prop k="Pause">{run.pause_kind === 'none' ? 'none' : run.pause_kind}</Prop>
			</RailGroup>

			<div className="rail__footer">
				<div>Started {fmtRelativeTime(run.started_at)}</div>
				<div>Updated {fmtRelativeTime(run.updated_at)}</div>
			</div>
		</div>
	)
}
