import { useRunDrawerStore } from '@/stores/runDrawer'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

interface OpenRunActionsProps {
	runId: string
	tone: 'warn' | 'accent'
}

export function OpenRunActions({ runId, tone }: OpenRunActionsProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const toneClass = tone === 'warn' ? 'text-warn' : 'ml-auto text-accent'
	return (
		<>
			<button
				type="button"
				onClick={() => openDrawer(runId, 'activity')}
				className={`font-data text-[11.5px] hover:underline focus-visible:outline-none ${toneClass}`}
			>
				Open run →
			</button>
			<Link
				to="/runs/$runId"
				params={{ runId }}
				className="font-data inline-flex items-center text-[11px] text-fg-dim hover:text-fg focus-visible:outline-none"
				aria-label="Open run detail page"
				title="Open run detail page"
			>
				<ExternalLink size={11} strokeWidth={1.85} aria-hidden="true" />
			</Link>
		</>
	)
}
