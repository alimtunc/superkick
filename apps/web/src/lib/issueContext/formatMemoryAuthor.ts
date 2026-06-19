export function formatMemoryAuthor(author: string | null): string {
	const trimmed = author?.trim()
	return trimmed && trimmed.length > 0 ? trimmed : 'Agent'
}
