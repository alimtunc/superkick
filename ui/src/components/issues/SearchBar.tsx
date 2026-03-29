export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder="Search by ID, title, label, project, assignee..."
			className="font-data h-8 w-full rounded-md border border-edge bg-carbon px-3 text-[11px] text-silver transition-colors outline-none placeholder:text-dim focus:border-edge-bright"
		/>
	)
}
