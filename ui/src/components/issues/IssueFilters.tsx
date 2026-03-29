import {
	BUCKET_META,
	BUCKET_ORDER,
	type ClassifiedIssues,
	type IssueBucket
} from '@/lib/domain/classifyIssues'

export type BucketFilter = IssueBucket | 'all'

export function IssueFilters({
	activeBucket,
	classified,
	totalCount,
	onSelect
}: {
	activeBucket: BucketFilter
	classified: ClassifiedIssues
	totalCount: number
	onSelect: (bucket: BucketFilter) => void
}) {
	const isAllActive = activeBucket === 'all'

	return (
		<div className="flex gap-1.5">
			<button
				type="button"
				onClick={() => onSelect('all')}
				className={`font-data flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
					isAllActive ? 'bg-white/10 text-silver' : 'text-dim hover:bg-white/5 hover:text-fog'
				}`}
			>
				All
				<span className="text-dim">{totalCount}</span>
			</button>
			{BUCKET_ORDER.map((bucket) => {
				const meta = BUCKET_META[bucket]
				const count = classified[bucket].length
				const isActive = bucket === activeBucket

				return (
					<button
						key={bucket}
						type="button"
						onClick={() => onSelect(bucket)}
						className={`font-data flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
							isActive ? 'bg-white/10 text-silver' : 'text-dim hover:bg-white/5 hover:text-fog'
						}`}
					>
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: meta.color, opacity: isActive ? 1 : 0.5 }}
						/>
						{meta.label}
						<span className="text-dim">{count}</span>
					</button>
				)
			})}
		</div>
	)
}
