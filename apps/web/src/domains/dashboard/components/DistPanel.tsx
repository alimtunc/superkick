import type { DistItem } from '@/types'

interface DistPanelProps {
	title: string
	items: DistItem[]
	total: number
}

export function DistPanel({ title, items, total }: DistPanelProps) {
	return (
		<div className="panel p-4">
			<h4 className="font-data mb-4 text-[10px] tracking-wider text-fg-dim uppercase">{title}</h4>
			{total === 0 ? (
				<p className="font-data text-[11px] text-fg-dim">No data</p>
			) : (
				<>
					<div className="mb-4 flex h-1.5 overflow-hidden rounded-full bg-border">
						{items
							.filter((i) => i.count > 0)
							.map((item) => (
								<div
									key={item.label}
									className={`${item.color} transition-all`}
									style={{ width: `${(item.count / total) * 100}%` }}
								/>
							))}
					</div>
					<div className="space-y-1.5">
						{items
							.filter((i) => i.count > 0)
							.map((item) => (
								<div key={item.label} className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className={`h-2 w-2 rounded-sm ${item.color}`} />
										<span className="text-[11px] text-fg-muted capitalize">
											{item.label}
										</span>
									</div>
									<span className="font-data text-[11px] text-fg-dim">
										{item.count}
										<span className="ml-1 text-fg-dim">
											({Math.round((item.count / total) * 100)}%)
										</span>
									</span>
								</div>
							))}
					</div>
				</>
			)}
		</div>
	)
}
