import { PrStateBadge } from '@/components/PrStateBadge'
import { Chip, chipBase } from '@/components/run-detail/Chip'
import { fmtRelativeTime } from '@/lib/domain'
import type { PullRequest, Run } from '@/types'
import { GitBranch, FolderGit2, BookMarked, Zap, Clock, ExternalLink } from 'lucide-react'

interface RunDetailsGridProps {
	run: Run
	pr: PullRequest | null
}

export function RunDetailsGrid({ run, pr }: RunDetailsGridProps) {
	return (
		<div className="mb-8 space-y-3">
			<div className="flex flex-wrap items-center gap-2 overflow-hidden">
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

			{run.error_message ? (
				<p className="font-data rounded border border-oxide/20 bg-oxide/5 px-3 py-2 text-[12px] text-oxide">
					{run.error_message}
				</p>
			) : null}
		</div>
	)
}
