import { fmtSecondsVerbose } from '@/lib/domain'
import type { Run, RunStep } from '@/types'

interface RunBudgetCardProps {
	run: Run
	steps: RunStep[]
	refTime: number
}

interface Row {
	label: string
	observed: string
	limit: string
	ratio: number | null
}

// Freeze duration at finished_at for terminal runs so the card doesn't keep ticking.
function elapsedSeconds(startedAt: string, finishedAt: string | null, refTime: number): number {
	const started = new Date(startedAt).getTime()
	if (Number.isNaN(started)) return 0
	const end = finishedAt ? new Date(finishedAt).getTime() : refTime
	const effective = Number.isNaN(end) ? refTime : end
	return Math.max(0, Math.floor((effective - started) / 1000))
}

function sumRetries(steps: RunStep[]): number {
	return steps.reduce((acc, s) => acc + Math.max(0, s.attempt - 1), 0)
}

function buildRows(run: Run, steps: RunStep[], refTime: number): Row[] {
	const rows: Row[] = []

	if (run.budget.duration_secs !== null) {
		const observed = elapsedSeconds(run.started_at, run.finished_at, refTime)
		const limit = run.budget.duration_secs
		rows.push({
			label: 'Duration',
			observed: fmtSecondsVerbose(observed),
			limit: fmtSecondsVerbose(limit),
			ratio: limit > 0 ? observed / limit : null
		})
	}

	if (run.budget.retries_max !== null) {
		const observed = sumRetries(steps)
		const limit = run.budget.retries_max
		rows.push({
			label: 'Retries',
			observed: String(observed),
			limit: String(limit),
			ratio: limit > 0 ? observed / limit : null
		})
	}

	if (run.budget.token_ceiling !== null) {
		const limit = run.budget.token_ceiling
		// Token aggregation is not yet wired up (SUP-72 risk 1) — show "n/a"
		// rather than a misleading zero.
		rows.push({
			label: 'Tokens',
			observed: 'n/a',
			limit: limit.toLocaleString(),
			ratio: null
		})
	}

	return rows
}

function ratioColor(ratio: number | null): string {
	if (ratio === null) return 'bg-fg-dim/30'
	if (ratio >= 1) return 'bg-danger'
	if (ratio >= 0.8) return 'bg-warn'
	return 'bg-success'
}

export function RunBudgetCard({ run, steps, refTime }: RunBudgetCardProps) {
	const rows = buildRows(run, steps, refTime)
	if (rows.length === 0) return null

	return (
		<div>
			<p className="font-data mb-3 text-[10px] tracking-[0.08em] text-fg-dim uppercase">
				Execution budget
			</p>
			<div className="space-y-3">
				{rows.map((row) => (
					<div key={row.label}>
						<div className="flex items-baseline justify-between">
							<span className="font-data text-[11.5px] text-fg">{row.label}</span>
							<span className="font-data text-[11.5px] text-fg-dim">
								{row.observed} / {row.limit}
							</span>
						</div>
						{row.ratio === null ? null : (
							<div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
								<div
									className={`h-full ${ratioColor(row.ratio)}`}
									style={{ width: `${Math.min(100, Math.round(row.ratio * 100))}%` }}
								/>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	)
}
