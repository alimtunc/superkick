import { BUCKET_META, BUCKET_ORDER } from '@/lib/domain/classifyIssues'
import type { ClassifiedIssues, IssueBucket } from '@/types'

export function StatusBar({ classified, total }: { classified: ClassifiedIssues; total: number }) {
	if (total === 0) return null

	const segments: { bucket: IssueBucket; count: number; color: string; label: string }[] = BUCKET_ORDER.map(
		(bucket) => ({
			bucket,
			count: classified[bucket].length,
			color: BUCKET_META[bucket].color,
			label: BUCKET_META[bucket].label
		})
	).filter((s) => s.count > 0)

	return (
		<div>
			<div className="mb-2 flex h-2 overflow-hidden rounded-sm">
				{segments.map((s) => (
					<div
						key={s.bucket}
						className="h-full"
						style={{
							width: `${(s.count / total) * 100}%`,
							backgroundColor: s.color,
							opacity: 0.7
						}}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{segments.map((s) => (
					<span key={s.bucket} className="flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-2 rounded-sm"
							style={{ backgroundColor: s.color }}
						/>
						<span className="font-data text-[10px] text-dim">
							{s.label} {s.count}
						</span>
					</span>
				))}
			</div>
		</div>
	)
}
