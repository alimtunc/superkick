import type { ReactNode } from 'react'

import { Pill } from '@/components/ui/pill'
import { X } from 'lucide-react'

export function RemovablePill({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
	return (
		<Pill
			tone="neutral"
			size="sm"
			trailing={
				<button
					type="button"
					onClick={onRemove}
					className="-mr-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded text-dim transition-colors hover:bg-edge hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
					aria-label="Remove"
				>
					<X size={11} strokeWidth={2} aria-hidden="true" />
				</button>
			}
		>
			{children}
		</Pill>
	)
}
