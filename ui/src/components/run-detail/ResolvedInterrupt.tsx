import { parseAnswer } from '@/lib/domain'
import type { Interrupt } from '@/types'

export function ResolvedInterrupt({ interrupt }: { interrupt: Interrupt }) {
	const answer = parseAnswer(interrupt.answer_json)
	const actionLabel = answer?.action?.replace(/_/g, ' ') ?? interrupt.status

	return (
		<div className="panel p-3">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-dim">
					{interrupt.status === 'resolved' ? '\u2713' : '\u2014'}
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-[12px] text-silver">{interrupt.question}</p>
					<div className="mt-1 flex items-center gap-2">
						<span className="font-data rounded bg-edge px-1.5 py-0.5 text-[10px] text-ash">
							{actionLabel}
						</span>
						{answer?.note ? (
							<span className="text-[11px] text-dim italic">"{answer.note}"</span>
						) : null}
						{interrupt.resolved_at ? (
							<span className="font-data text-[10px] text-dim">
								{new Date(interrupt.resolved_at).toLocaleString()}
							</span>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}
