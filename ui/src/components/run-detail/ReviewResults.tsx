import type { RunStep, ReviewSwarmResult } from '@/types'

function parseReviewResult(step: RunStep): ReviewSwarmResult | null {
	if (!step.output_json) return null
	try {
		const parsed = typeof step.output_json === 'string' ? JSON.parse(step.output_json) : step.output_json
		if (parsed && Array.isArray(parsed.findings)) return parsed as ReviewSwarmResult
		return null
	} catch {
		return null
	}
}

export function ReviewResults({ steps }: { steps: RunStep[] }) {
	const reviewSteps = steps.filter((s) => s.step_key === 'review_swarm')
	if (reviewSteps.length === 0) return null

	return (
		<div className="mb-6 space-y-3">
			{reviewSteps.map((step) => {
				const result = parseReviewResult(step)
				if (!result) {
					if (step.status === 'running') {
						return (
							<div key={step.id} className="panel glow-green p-4">
								<p className="font-data live-pulse text-sm text-cyan">
									Review swarm in progress...
								</p>
							</div>
						)
					}
					return null
				}

				const glowClass = result.gate_passed ? 'glow-green' : 'glow-red'

				return (
					<div key={step.id} className={`panel ${glowClass} p-4`}>
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-sm font-semibold text-fog">Review Swarm</h3>
							<span
								className={`font-data rounded px-2 py-0.5 text-[10px] tracking-wider uppercase ${
									result.gate_passed
										? 'bg-mineral-dim text-mineral'
										: 'bg-oxide-dim text-oxide'
								}`}
							>
								{result.gate_passed ? 'PASSED' : 'FAILED'}
							</span>
						</div>

						<p className="font-data mb-3 text-[11px] text-dim">
							{result.passed_count}/{result.total_agents} agents passed
							{result.failed_count > 0 ? ` \u00b7 ${result.failed_count} findings` : ''}
						</p>

						<div className="space-y-0.5">
							{result.findings.map((f) => (
								<div
									key={f.session_id}
									className="flex items-center gap-2 rounded border border-edge/50 bg-graphite/50 px-3 py-1.5 text-[12px]"
								>
									<span className={f.passed ? 'text-mineral' : 'text-oxide'}>
										{f.passed ? '\u2713' : '\u2717'}
									</span>
									<span className="font-data text-fog">{f.agent_name}</span>
									<span className="font-data ml-auto text-[10px] text-dim">
										exit {f.exit_code ?? '?'}
									</span>
								</div>
							))}
						</div>
					</div>
				)
			})}
		</div>
	)
}
