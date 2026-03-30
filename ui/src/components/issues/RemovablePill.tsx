import type { ReactNode } from 'react'

export function RemovablePill({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2 py-0.5">
			{children}
			<button
				type="button"
				onClick={onRemove}
				className="cursor-pointer text-[11px] text-dim transition-colors hover:text-silver"
			>
				&times;
			</button>
		</span>
	)
}
