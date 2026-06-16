export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
	if (query.trim().length === 0) return items
	const needle = query.toLowerCase()
	return items.filter((item) => item.name.toLowerCase().includes(needle))
}
