export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder="Search by ID, title, label, project, assignee..."
			className="h-8 w-full rounded-md border border-border bg-surface px-3 font-mono text-[11px] text-fg transition-colors outline-none placeholder:text-fg-dim hover:border-border-strong focus:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40"
		/>
	)
}
