import type { ReactNode } from 'react'

import { PrStateBadge } from '@/components/PrStateBadge'
import { CopyValue } from '@/components/run-detail/CopyValue'
import { fmtRelativeTime } from '@/lib/domain'
import type { PullRequest, Run } from '@/types'
import { GitBranch, FolderGit2, BookMarked, Zap, Clock, ExternalLink } from 'lucide-react'

// ── Chip — single element for both static and copyable ───────────────

const chipBase =
	'font-data inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[11px] leading-none text-silver'

function Chip({ icon, label, copyValue }: { icon: ReactNode; label: string; copyValue?: string }) {
	const content = (
		<>
			<span className="text-dim">{icon}</span>
			<span>{label}</span>
		</>
	)

	if (copyValue) {
		return (
			<CopyValue
				value={copyValue}
				display={content}
				hideIcon
				className={`${chipBase} cursor-pointer transition-colors hover:bg-white/8`}
			/>
		)
	}

	return <span className={chipBase}>{content}</span>
}

// ── Component ─────────────────────────────────────────────────────────

interface RunDetailsGridProps {
	run: Run
	pr: PullRequest | null
}

export function RunDetailsGrid({ run, pr }: RunDetailsGridProps) {
	return (
		<div className="mb-8 space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				{run.branch_name ? (
					<Chip
						icon={<GitBranch size={14} />}
						label={run.branch_name}
						copyValue={run.branch_name}
					/>
				) : null}

				{run.worktree_path ? (
					<Chip icon={<FolderGit2 size={14} />} label="worktree" copyValue={run.worktree_path} />
				) : null}

				<Chip icon={<BookMarked size={14} />} label={run.repo_slug} />
				<Chip icon={<Zap size={14} />} label={run.trigger_source} />
				<Chip icon={<Clock size={14} />} label={fmtRelativeTime(run.started_at)} />

				{run.finished_at ? (
					<Chip icon={<Clock size={14} />} label={`finished ${fmtRelativeTime(run.finished_at)}`} />
				) : null}

				{pr ? (
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className={`${chipBase} gap-2 text-neon-green transition-colors hover:bg-neon-green/10`}
					>
						<ExternalLink size={14} />
						<span>#{pr.number}</span>
						<PrStateBadge state={pr.state} />
					</a>
				) : null}
			</div>

			{run.operator_instructions ? (
				<p
					className="font-data text-[12px] leading-relaxed text-dim"
					title={run.operator_instructions}
				>
					{run.operator_instructions}
				</p>
			) : null}

			{run.error_message ? (
				<p className="font-data rounded border border-oxide/20 bg-oxide/5 px-3 py-2 text-[12px] text-oxide">
					{run.error_message}
				</p>
			) : null}
		</div>
	)
}
