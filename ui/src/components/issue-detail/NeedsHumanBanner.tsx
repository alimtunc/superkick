import { runNarrative, toneAccentClass, toneTextClass } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

export function NeedsHumanBanner({ runs }: { runs: LinkedRunSummary[] }) {
	const waiting = runs
		.filter((run) => run.state === 'waiting_human')
		.toSorted((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
	if (!waiting) return null

	const narrative = runNarrative('waiting_human')

	return (
		<Link
			to="/runs/$runId"
			params={{ runId: waiting.id }}
			className={`mb-6 flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:border-gold ${toneAccentClass.attention}`}
		>
			<div className="flex flex-col">
				<span className={`font-data text-[12px] font-medium ${toneTextClass.attention}`}>
					{narrative.headline}
				</span>
				<span className="font-data text-[11px] text-silver/80">{narrative.nextHint}</span>
			</div>
			<span
				className={`font-data inline-flex items-center gap-1 text-[11px] ${toneTextClass.attention}`}
			>
				Open run
				<ArrowRight size={12} />
			</span>
		</Link>
	)
}
