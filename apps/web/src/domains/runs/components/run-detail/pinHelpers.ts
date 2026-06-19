export function pinClass(watched: boolean, maxReached: boolean): string {
	if (watched) return 'border-accent/40 bg-accent-soft text-accent'
	if (maxReached) return 'opacity-40 cursor-not-allowed'
	return ''
}

export function pinTitle(watched: boolean, maxReached: boolean): string {
	if (watched) return 'Remove from watch rail'
	if (maxReached) return 'Max 5 watched'
	return 'Pin to watch rail'
}
