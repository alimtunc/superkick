import { snippetSegments, splitHighlight, type HighlightSegment } from '@/lib/highlightSnippet'

interface MatchHighlightProps {
	text: string
	query: string
}

export function MatchHighlight({ text, query }: MatchHighlightProps) {
	const segments = splitHighlight(text, query)
	return <HighlightSegments segments={segments} />
}

interface SnippetHighlightProps {
	snippet: string
	matchStart: number
	matchEnd: number
}

export function SnippetHighlight({ snippet, matchStart, matchEnd }: SnippetHighlightProps) {
	const segments = snippetSegments(snippet, matchStart, matchEnd)
	return <HighlightSegments segments={segments} />
}

function HighlightSegments({ segments }: { segments: HighlightSegment[] }) {
	// Position IS the identity for highlight segments: splitHighlight / snippetSegments
	// emit a fixed-shape text-mark-text list that is never reordered or filtered. Value-only
	// keys can collide when leading/trailing text happen to match.
	return (
		<>
			{segments.map((seg, i) =>
				seg.type === 'mark' ? (
					// oxlint-disable-next-line react/no-array-index-key
					<mark key={`m-${i}`} className="rounded-xs bg-accent-soft px-px text-fg">
						{seg.value}
					</mark>
				) : (
					// oxlint-disable-next-line react/no-array-index-key
					<span key={`t-${i}`}>{seg.value}</span>
				)
			)}
		</>
	)
}
