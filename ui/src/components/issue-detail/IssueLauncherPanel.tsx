import { LatestRunCard } from '@/components/issue-detail/LatestRunCard'
import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import { pickLatestRun } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'
import { Btn } from '@/ui/Btn'
import { useNavigate } from '@tanstack/react-router'

interface IssueLauncherPanelProps {
	issue: IssueDetailResponse
}

export function IssueLauncherPanel({ issue }: IssueLauncherPanelProps) {
	const navigate = useNavigate()
	const { activeTask } = useIssueLaunchTasks(issue.identifier)
	const latest = pickLatestRun(issue.linked_runs)

	return (
		<section className="flex flex-col gap-3">
			<div className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">Launch task</div>
			<Btn
				kind="primary"
				size="md"
				icon="zap"
				iconRight="arrowRight"
				full
				onClick={() => navigate({ to: '/tasks/new', search: { issue: issue.identifier } })}
				aria-label={`Launch task for ${issue.identifier}`}
			>
				Launch task
			</Btn>
			{activeTask ? (
				<Btn
					kind="secondary"
					size="md"
					iconRight="arrowRight"
					full
					onClick={() => navigate({ to: '/tasks/$taskId', params: { taskId: activeTask.id } })}
					aria-label="View active task"
				>
					View active task
				</Btn>
			) : null}
			{latest ? <LatestRunCard run={latest} /> : null}
		</section>
	)
}
