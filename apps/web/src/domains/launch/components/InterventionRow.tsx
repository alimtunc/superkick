import type { LaunchTaskIntervention } from '@/types'
import { MessageSquare } from 'lucide-react'

interface InterventionRowProps {
	intervention: LaunchTaskIntervention
}

function relativeTimestamp(iso: string): string {
	try {
		const d = new Date(iso)
		return d.toLocaleString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
	} catch {
		return iso
	}
}

export function InterventionRow({ intervention }: InterventionRowProps) {
	const consumedAt = intervention.consumed_at
	const status =
		consumedAt != null ? `delivered at ${relativeTimestamp(consumedAt)}` : 'queued for next step'

	return (
		<div className="mb-3 rounded-md border border-border bg-surface/30 px-3 py-2">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 text-fg-dim">
					<MessageSquare size={12} strokeWidth={1.75} aria-hidden="true" />
					<span className="font-data text-[11px] tracking-wide uppercase">
						{intervention.author}
					</span>
				</div>
				<span className="font-data text-[11px] text-fg-dim">{status}</span>
			</div>
			<p className="font-data mt-1.5 text-[12px] whitespace-pre-wrap text-fg">{intervention.body}</p>
		</div>
	)
}
