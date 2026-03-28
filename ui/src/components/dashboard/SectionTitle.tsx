interface SectionTitleProps {
	title: string
	accent?: string
	count?: number
}

const accentColors: Record<string, string> = {
	oxide: 'text-oxide',
	mineral: 'text-mineral',
	gold: 'text-gold'
}

export function SectionTitle({ title, accent, count }: SectionTitleProps) {
	const accentColor = (accent && accentColors[accent]) ?? 'text-silver'
	return (
		<div className="mb-4 flex items-center gap-3">
			<h2 className={`font-data text-[11px] font-medium tracking-widest uppercase ${accentColor}`}>
				{title}
			</h2>
			{count !== undefined ? <span className="font-data text-[11px] text-dim">{count}</span> : null}
			<div className="h-px flex-1 bg-edge" />
		</div>
	)
}
