import { InspectorSection } from '@/components/ui/inspector-section'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

interface NowLinkedRunProps {
	runId: string
}

export function NowLinkedRun({ runId }: NowLinkedRunProps) {
	return (
		<InspectorSection label="Linked run">
			<Link
				to="/runs/$runId"
				params={{ runId }}
				className="mt-2 inline-flex items-center gap-2 rounded-md border border-edge bg-canvas/40 px-3 py-2 text-[12px] text-fg transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label="Open linked run detail"
			>
				<ExternalLink size={12} strokeWidth={1.85} aria-hidden="true" />
				<span className="font-data text-[11.5px]">{runId.slice(0, 8)}</span>
				<span className="text-fg-dim">·</span>
				<span className="text-fg-muted">Open inspector</span>
			</Link>
		</InspectorSection>
	)
}
