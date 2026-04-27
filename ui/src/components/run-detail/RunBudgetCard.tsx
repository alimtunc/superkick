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

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60)
		const s = Math.round(seconds % 60)
		return s === 0 ? `${m}m` : `${m}m ${s}s`
	}
	if (seconds < 86_400) {
		const h = Math.floor(seconds / 3600)
		const m = Math.floor((seconds % 3600) / 60)
		return m === 0 ? `${h}h` : `${h}h ${m}m`
	}
	const d = Math.floor(seconds / 86_400)
	const h = Math.floor((seconds % 86_400) / 3600)
	return h === 0 ? `${d}d` : `${d}d ${h}h`
}

function elapsedSeconds(startedAt: string, finishedAt: string | null, refTime: number): number {
	const started = new Date(startedAt).getTime()
	if (Number.isNaN(started)) return 0
	// For terminal runs, freeze the duration at `finished_at` — without this
	// the card keeps ticking forever after a cancelled / completed / failed run.
	const end = finishedAt ? new Date(finishedAt).getTime() : refTime
	const effective = Number.isNaN(end) ? refTime : end
	return Math.max(0, Math.floor((effective - started) / 1000))
}

function sumRetries(steps: RunStep[]): number {
	return steps.reduce((acc, s) => acc + Math.max(0, s.attempt - 1), 0)
}

/**
 * Only render dimensions the project actually declared a ceiling for —
 * an empty budget card would just be noise.
 */
function buildRows(run: Run, steps: RunStep[], refTime: number): Row[] {
	const rows: Row[] = []

	if (run.budget.duration_secs !== null) {
		const observed = elapsedSeconds(run.started_at, run.finished_at, refTime)
		const limit = run.budget.duration_secs
		rows.push({
			label: 'Duration',
			observed: formatDuration(observed),
			limit: formatDuration(limit),
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
	if (ratio === null) return 'bg-dim/30'
	if (ratio >= 1) return 'bg-oxide'
	if (ratio >= 0.8) return 'bg-gold'
	return 'bg-mineral'
}

export function RunBudgetCard({ run, steps, refTime }: RunBudgetCardProps) {
	const rows = buildRows(run, steps, refTime)
	if (rows.length === 0) return null

	return (
		<div className="mb-8 rounded-md border border-edge bg-carbon/40 p-4">
			<p className="font-data mb-3 text-[10px] tracking-wider text-dim uppercase">Execution budget</p>
			<div className="space-y-3">
				{rows.map((row) => (
					<div key={row.label}>
						<div className="flex items-baseline justify-between">
							<span className="font-data text-[11px] text-fog">{row.label}</span>
							<span className="font-data text-[11px] text-dim">
								{row.observed} / {row.limit}
							</span>
						</div>
						{row.ratio === null ? null : (
							<div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-edge/50">
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
