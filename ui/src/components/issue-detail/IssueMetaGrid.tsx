import type { IssueDetailResponse } from '@/types'

export function IssueMetaGrid({ issue }: { issue: IssueDetailResponse }) {
	const fields = [
		{ label: 'Title', value: issue.title },
		{ label: 'Priority', value: issue.priority.label },
		{ label: 'Assignee', value: issue.assignee?.name ?? '--' },
		{
			label: 'Parent',
			value: issue.parent ? `${issue.parent.identifier} — ${issue.parent.title}` : '--'
		},
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
							className="font-data inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
							style={{ color: l.color, borderColor: `${l.color}40` }}
						>
							<span
								className="inline-block h-1.5 w-1.5 rounded-full"
								style={{ backgroundColor: l.color }}
							/>
							{l.name}
						</span>
					))}
				</div>
			) : null}
		</div>
	)
}
