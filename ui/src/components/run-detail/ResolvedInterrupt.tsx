import { ClientDateTime } from '@/components/ui/client-date-time'
import { parseAnswer } from '@/lib/domain'
import type { Interrupt } from '@/types'
import { Check, Minus } from 'lucide-react'

export function ResolvedInterrupt({ interrupt }: { interrupt: Interrupt }) {
	const answer = parseAnswer(interrupt.answer_json)
	const actionLabel = answer?.action?.replace(/_/g, ' ') ?? interrupt.status

	return (
		<div className="panel p-3">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 inline-flex text-dim">
					{interrupt.status === 'resolved' ? (
						<Check size={16} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<Minus size={16} strokeWidth={1.75} aria-hidden="true" />
					)}
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
								<ClientDateTime value={interrupt.resolved_at} />
							</span>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}
