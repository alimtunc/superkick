export interface HighlightSegment {
	type: 'text' | 'mark'
	value: string
}

export function splitHighlight(text: string, query: string): HighlightSegment[] {
	if (!query) return [{ type: 'text', value: text }]
	const lowerText = text.toLowerCase()
	const lowerQuery = query.toLowerCase()
	const idx = lowerText.indexOf(lowerQuery)
	if (idx < 0) return [{ type: 'text', value: text }]
	const segments: HighlightSegment[] = []
	if (idx > 0) segments.push({ type: 'text', value: text.slice(0, idx) })
	segments.push({ type: 'mark', value: text.slice(idx, idx + query.length) })
	if (idx + query.length < text.length) {
		segments.push({ type: 'text', value: text.slice(idx + query.length) })
	}
	return segments
}

export function snippetSegments(snippet: string, matchStart: number, matchEnd: number): HighlightSegment[] {
	if (matchStart < 0 || matchEnd <= matchStart || matchEnd > snippet.length) {
		return [{ type: 'text', value: snippet }]
	}
	const segments: HighlightSegment[] = []
	if (matchStart > 0) segments.push({ type: 'text', value: snippet.slice(0, matchStart) })
	segments.push({ type: 'mark', value: snippet.slice(matchStart, matchEnd) })
	if (matchEnd < snippet.length) {
		segments.push({ type: 'text', value: snippet.slice(matchEnd) })
	}
	return segments
}
