import type { Run } from '@/types'

interface RunDetailsGridProps {
	run: Run
	prUrl: string | null
}

export function RunDetailsGrid({ run, prUrl }: RunDetailsGridProps) {
	const fields = [
		{ label: 'ID', value: run.id },
		{ label: 'Repo', value: run.repo_slug },
		{ label: 'Branch', value: run.branch_name ?? '--' },
		{ label: 'Step', value: run.current_step_key ?? '--' },
		{ label: 'Started', value: new Date(run.started_at).toLocaleString() },
		{
			label: run.finished_at ? 'Finished' : 'Trigger',
			value: run.finished_at ? new Date(run.finished_at).toLocaleString() : run.trigger_source
		}
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
			{prUrl ? (
				<dl className="mt-3 flex items-center gap-2 rounded border border-neon-green/20 bg-neon-green/5 px-3 py-2">
					<dt className="font-data text-[10px] tracking-wider text-dim uppercase">Pull Request</dt>
					<dd>
						<a
							href={prUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="font-data text-[11px] text-neon-green transition-colors hover:text-neon-green/80"
						>
							{prUrl}
						</a>
					</dd>
				</dl>
			) : null}
			{run.error_message ? (
				<p className="font-data mt-3 rounded border border-oxide/20 bg-oxide-dim p-2 text-[12px] text-oxide">
					{run.error_message}
				</p>
			) : null}
		</div>
	)
}
