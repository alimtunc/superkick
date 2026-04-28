export function formatShortDate(iso: string): string {
	const d = new Date(iso)
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0])
		.join('')
		.toUpperCase()
		.slice(0, 2)
}
