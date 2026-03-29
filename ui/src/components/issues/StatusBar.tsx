import type { StatusGroup } from '@/hooks/useIssues'

export function StatusBar({ groups, total }: { groups: StatusGroup[]; total: number }) {
	if (total === 0) return null

	return (
		<div>
			<div className="mb-2 flex h-2 overflow-hidden rounded-sm">
				{groups.map((g) => (
					<div
						key={g.name}
						className="h-full"
						style={{
							width: `${(g.count / total) * 100}%`,
							backgroundColor: g.color,
							opacity: 0.7
						}}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{groups.map((g) => (
					<span key={g.name} className="flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-2 rounded-sm"
							style={{ backgroundColor: g.color }}
						/>
						<span className="font-data text-[10px] text-dim">
							{g.name} {g.count}
						</span>
					</span>
				))}
			</div>
		</div>
	)
}
