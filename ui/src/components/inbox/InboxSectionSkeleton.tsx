interface InboxSectionSkeletonProps {
	rows?: number
}

export function InboxSectionSkeleton({ rows = 2 }: InboxSectionSkeletonProps) {
	return (
		<div className="divide-y divide-edge/50 overflow-hidden rounded border border-edge">
			{Array.from({ length: rows }, (_, idx) => (
				<div key={idx} className="flex items-center gap-3 px-3 py-2">
					<div className="h-3 w-12 animate-pulse rounded bg-edge/40" />
					<div className="h-3 w-16 animate-pulse rounded bg-edge/40" />
					<div className="h-2.5 flex-1 animate-pulse rounded bg-edge/30" />
				</div>
			))}
		</div>
	)
}
