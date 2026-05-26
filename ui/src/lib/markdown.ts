/**
 * Flatten a markdown body to a single line of prose for previews / hover cards.
 * Strips headings, fenced code, list bullets, and inline emphasis / link syntax.
 * Not a full markdown parser — only the noise patterns that show up in issue
 * descriptions and comments.
 */
export function stripMarkdown(source: string): string {
	return source
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s{0,3}[-*•]\s+/gm, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/(\*\*|__)(.+?)\1/g, '$2')
		.replace(/(\*|_)(.+?)\1/g, '$2')
		.replace(/\s+/g, ' ')
		.trim()
}

export type MarkdownBlock =
	| { type: 'heading'; level: 2 | 3; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'list'; items: string[] }
	| { type: 'code'; text: string }

const HEADING_RE = /^(#{2,3})\s+(.+)$/
const LIST_RE = /^[-*•]\s+/

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
	const lines = source.trim().split(/\r?\n/)
	const blocks: MarkdownBlock[] = []
	let index = 0

	while (index < lines.length) {
		const line = lines[index]?.trimEnd() ?? ''

		if (line.trim() === '') {
			index += 1
			continue
		}

		if (line.trim().startsWith('```')) {
			const codeLines: string[] = []
			index += 1
			while (index < lines.length && !(lines[index]?.trim().startsWith('```') ?? false)) {
				codeLines.push(lines[index] ?? '')
				index += 1
			}
			blocks.push({ type: 'code', text: codeLines.join('\n').trimEnd() })
			index += 1
			continue
		}

		const heading = line.trim().match(HEADING_RE)
		if (heading) {
			blocks.push({
				type: 'heading',
				level: heading[1].length === 2 ? 2 : 3,
				text: heading[2]
			})
			index += 1
			continue
		}

		if (LIST_RE.test(line.trim())) {
			const items: string[] = []
			while (index < lines.length && LIST_RE.test((lines[index] ?? '').trim())) {
				items.push((lines[index] ?? '').trim().replace(LIST_RE, ''))
				index += 1
			}
			blocks.push({ type: 'list', items })
			continue
		}

		const paragraphLines: string[] = []
		while (index < lines.length) {
			const next = lines[index] ?? ''
			const trimmed = next.trim()
			if (
				trimmed === '' ||
				trimmed.startsWith('```') ||
				HEADING_RE.test(trimmed) ||
				LIST_RE.test(trimmed)
			) {
				break
			}
			paragraphLines.push(trimmed)
			index += 1
		}
		blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') })
	}

	return blocks
}
