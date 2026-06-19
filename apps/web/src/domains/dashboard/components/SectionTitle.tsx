interface SectionTitleProps {
	title: string
	accent?: string
	count?: number
}

const accentColors: Record<string, string> = {
	oxide: 'text-danger',
	mineral: 'text-success',
	gold: 'text-warn'
}

export function SectionTitle({ title, accent, count }: SectionTitleProps) {
	const accentColor = (accent && accentColors[accent]) ?? 'text-fg-muted'
	return (
		<div className="mb-4 flex items-center gap-3">
			<h2 className={`font-data text-[11px] font-medium tracking-widest uppercase ${accentColor}`}>
				{title}
			</h2>
			{count !== undefined ? <span className="font-data text-[11px] text-fg-dim">{count}</span> : null}
			<div className="h-px flex-1 bg-border" />
		</div>
	)
}
