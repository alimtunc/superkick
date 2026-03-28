import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'

interface CompletedTableProps {
	completed: Run[]
}
import { fmtDuration } from '@/lib/domain'

import { SectionTitle } from './SectionTitle'

function fmtRunDuration(r: Run): string {
	if (!r.finished_at) return '--'
	return fmtDuration(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())
}

export function CompletedTable({ completed }: CompletedTableProps) {
	return (
		<section className="fade-up delay-4">
			<SectionTitle title="COMPLETED" accent="mineral" count={completed.length} />
			{completed.length === 0 ? (
				<p className="font-data text-sm text-dim">No completed runs.</p>
			) : (
				<div className="panel overflow-hidden">
					<table className="w-full text-[12px]">
						<thead>
							<tr className="font-data border-b border-edge text-[10px] tracking-wider text-dim uppercase">
								<th className="px-3 py-2 text-left">Issue</th>
								<th className="hidden px-3 py-2 text-left sm:table-cell">Repo</th>
								<th className="px-3 py-2 text-left">Duration</th>
								<th className="hidden px-3 py-2 text-left md:table-cell">Branch</th>
								<th className="px-3 py-2 text-right">Finished</th>
							</tr>
						</thead>
						<tbody>
							{completed
								.toSorted(
									(a, b) =>
										new Date(b.finished_at!).getTime() -
										new Date(a.finished_at!).getTime()
								)
								.slice(0, 15)
								.map((run) => (
									<tr
										key={run.id}
										className="border-b border-edge/50 transition-colors hover:bg-slate-deep/50"
									>
										<td className="px-3 py-2">
											<Link
												to="/runs/$runId"
												params={{ runId: run.id }}
												className="font-data text-mineral transition-colors hover:text-neon-green"
											>
												{run.issue_identifier}
											</Link>
										</td>
										<td className="hidden px-3 py-2 text-silver sm:table-cell">
											{run.repo_slug}
										</td>
										<td className="font-data px-3 py-2 text-fog">
											{fmtRunDuration(run)}
										</td>
										<td className="font-data hidden max-w-40 truncate px-3 py-2 text-dim md:table-cell">
											{run.branch_name ?? '--'}
										</td>
										<td className="font-data px-3 py-2 text-right text-dim">
											{run.finished_at
												? new Date(run.finished_at).toLocaleString([], {
														month: 'short',
														day: 'numeric',
														hour: '2-digit',
														minute: '2-digit'
													})
												: '--'}
										</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}
