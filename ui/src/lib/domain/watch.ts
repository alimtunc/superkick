export function watchButtonClass(watched: boolean, maxReached: boolean): string {
	if (watched) return 'text-mineral hover:text-oxide'
	if (maxReached) return 'text-dim/30 cursor-not-allowed'
	return 'text-dim hover:text-mineral opacity-0 group-hover:opacity-100'
}

export function watchButtonTitle(watched: boolean, maxReached: boolean): string {
	if (watched) return 'Unwatch'
	if (maxReached) return 'Max 5 watched'
	return 'Watch this run'
}
