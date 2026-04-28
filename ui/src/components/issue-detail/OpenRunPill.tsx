import { Pill, type PillSize } from '@/components/ui/pill'
import { Link } from '@tanstack/react-router'

interface OpenRunPillProps {
	runId: string
	size?: PillSize
}

export function OpenRunPill({ runId, size = 'xs' }: OpenRunPillProps) {
	return (
		<Link
			to="/runs/$runId"
			params={{ runId }}
			className="font-data inline-flex shrink-0 items-center focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
		>
			<Pill tone="neutral" size={size} interactive className="tracking-wider uppercase">
				Open run
			</Pill>
		</Link>
	)
}
