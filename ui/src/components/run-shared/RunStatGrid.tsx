import { fmtElapsed } from '@/lib/domain'
import { runToolCallsQuery } from '@/lib/queries'
import type { Run, RunStep } from '@/types'
import { useQuery } from '@tanstack/react-query'

interface RunStatGridProps {
	run: Run
	steps: RunStep[]
	refTime: number
}

interface StatCell {
	key: string
	value: string
}

function maxAttempt(steps: RunStep[]): number {
	return steps.reduce((acc, step) => Math.max(acc, step.attempt), 1)
}

function stepsProgress(steps: RunStep[]): string {
	const done = steps.filter((step) => step.status === 'succeeded' || step.status === 'skipped').length
	return `${done} / ${steps.length || 0}`
}

export function RunStatGrid({ run, steps, refTime }: RunStatGridProps) {
	const { data: toolCalls } = useQuery(runToolCallsQuery(run.id))
	const toolCallCount = toolCalls?.length ?? null

	const cells: StatCell[] = [
		{ key: 'Elapsed', value: fmtElapsed(run.started_at, refTime) },
		{ key: 'Tokens', value: '—' },
		{ key: 'Steps', value: stepsProgress(steps) },
		{ key: 'Attempts', value: String(maxAttempt(steps)) },
		{ key: 'Tool calls', value: toolCallCount === null ? '—' : String(toolCallCount) },
		{ key: 'Est. cost', value: '—' }
	]

	return (
		<div className="statgrid">
			{cells.map((cell) => (
				<div key={cell.key} className="stat">
					<div className="stat__k">{cell.key}</div>
					<div className="stat__v">{cell.value}</div>
				</div>
			))}
		</div>
	)
}
