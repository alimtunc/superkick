import { useState } from 'react'

import { PastRunRow } from '@/components/issue-detail/execution-log/PastRunRow'
import type { LaunchTaskWithSteps } from '@/types'

interface PastRunsSectionProps {
	past: readonly LaunchTaskWithSteps[]
}

export function PastRunsSection({ past }: PastRunsSectionProps) {
	const [open, setOpen] = useState(false)
	if (past.length === 0) return null
	const label = past.length === 1 ? 'past run' : 'past runs'

	return (
		<div className="-mt-1 flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="inline-flex h-6 items-center self-start rounded text-[11.5px] text-fg-dim transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				{open ? 'Hide' : 'Show'} {past.length} {label}
			</button>
			{open ? (
				<ul>
					{past.map((entry) => (
						<li key={entry.task.id}>
							<PastRunRow entry={entry} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}
