export function watchButtonClass(watched: boolean, maxReached: boolean): string {
	if (watched) return 'text-success hover:text-danger'
	if (maxReached) return 'text-fg-dim/30 cursor-not-allowed'
	return 'text-fg-dim hover:text-success opacity-0 group-hover:opacity-100'
}

export function watchButtonTitle(watched: boolean, maxReached: boolean): string {
	if (watched) return 'Unwatch'
	if (maxReached) return 'Max 5 watched'
	return 'Watch this run'
}
