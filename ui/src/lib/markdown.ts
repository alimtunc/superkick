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

const HTML_NOISE_TAGS =
	/<\/?(?:details|div|span|img|picture|source|table|thead|tbody|tfoot|colgroup|col|tr|td|th|p|hr|a|b|i|em|strong|sub|sup|kbd|samp|var|mark|blockquote|pre|code|h[1-6]|ul|ol|li|dl|dt|dd|font|center|small|figure|figcaption|article|section|header|footer|nav|aside|main)\b[^>]*>/gi

// Fenced (```…```) and inline (`…`) code spans are masked behind a sentinel
// (no surrounding whitespace) before HTML/whitespace cleanup, so an HTML sample
// inside a code block is never mistaken for markup and adjacent spaces survive.
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`\n]*`)/g
const CODE_PLACEHOLDER_RE = /@@CODE(\d+)@@/g

function stripHtmlNoise(text: string): string {
	return text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<summary[\s\S]*?<\/summary>/gi, '')
		.replace(/<(https?:\/\/[^>\s]+)>/gi, '$1')
		.replace(/<mailto:([^>\s]+)>/gi, '$1')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(HTML_NOISE_TAGS, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
}

/**
 * Strip the HTML wrappers GitHub/Linear bots emit (Copilot review summaries,
 * `<details>` foldouts, tracking comments) so the body renders as readable
 * markdown instead of raw `<!-- … -->` / `<details>` noise. Markdown syntax is
 * preserved, and code spans pass through untouched so HTML samples a reviewer
 * actually wrote survive verbatim.
 */
export function sanitizeGithubMarkdown(source: string): string {
	const codeSpans: string[] = []
	const masked = source.replace(CODE_SPAN_RE, (match) => {
		codeSpans.push(match)
		return `@@CODE${codeSpans.length - 1}@@`
	})
	return stripHtmlNoise(masked)
		.trim()
		.replace(CODE_PLACEHOLDER_RE, (_match, index) => codeSpans[Number(index)] ?? '')
}
