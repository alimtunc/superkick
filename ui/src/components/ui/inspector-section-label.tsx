interface InspectorSectionLabelProps {
	children: string
}

export function InspectorSectionLabel({ children }: InspectorSectionLabelProps) {
	return <div className="font-data text-[10px] tracking-[0.08em] text-fg-dim uppercase">{children}</div>
}
