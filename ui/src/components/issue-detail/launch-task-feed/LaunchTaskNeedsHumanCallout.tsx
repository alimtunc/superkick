import { toneAccentClass, toneTextClass } from '@/lib/domain'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { LaunchTaskStep } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

interface LaunchTaskNeedsHumanCalloutProps {
	headline: string
	hint: string
	blockingStep: LaunchTaskStep | null
}

export function LaunchTaskNeedsHumanCallout({
	headline,
	hint,
	blockingStep
}: LaunchTaskNeedsHumanCalloutProps) {
	const openChat = useWorkspaceChatStore((s) => s.openChat)
	const linkedRunId = blockingStep?.linked_run_id ?? null

	const sharedClass = `mb-4 flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none ${toneAccentClass.attention}`

	const body = (
		<div className="flex flex-col">
			<span className={`text-[13px] font-medium ${toneTextClass.attention}`}>{headline}</span>
			<span className="font-data text-[11px] text-silver">{hint}</span>
		</div>
	)

	const cta = (
		<span className={`font-data inline-flex items-center gap-1 text-[11px] ${toneTextClass.attention}`}>
			{linkedRunId ? 'Open run' : 'Open chat'}
			<ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" />
		</span>
	)

	if (linkedRunId) {
		return (
			<Link to="/runs/$runId" params={{ runId: linkedRunId }} className={sharedClass}>
				{body}
				{cta}
			</Link>
		)
	}

	return (
		<button type="button" onClick={openChat} className={`${sharedClass} text-left`}>
			{body}
			{cta}
		</button>
	)
}
