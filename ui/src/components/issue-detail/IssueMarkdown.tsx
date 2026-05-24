import type { ReactNode } from 'react'

import { type MarkdownBlock, parseMarkdownBlocks } from '@/lib/markdown'
import { cn } from '@/lib/utils'

interface IssueMarkdownProps {
	text: string
	className?: string
	compact?: boolean
}

export function IssueMarkdown({ text, className, compact = false }: IssueMarkdownProps) {
	const blocks = parseMarkdownBlocks(text)
	if (blocks.length === 0) return null

	return (
		<div className={cn(compact ? 'space-y-2' : 'space-y-5', 'text-fg', className)}>
			{blocks.map((block, index) => renderBlock(block, index, compact))}
		</div>
	)
}

function renderBlock(block: MarkdownBlock, index: number, compact: boolean): ReactNode {
	if (block.type === 'heading') {
		const className = compact
			? 'text-[13px] font-semibold text-fg-muted'
			: 'text-[15px] font-semibold text-fg-muted'
		if (block.level === 2) {
			return (
				<h2 key={index} className={className}>
					{renderInline(block.text)}
				</h2>
			)
		}
		return (
			<h3 key={index} className={className}>
				{renderInline(block.text)}
			</h3>
		)
	}

	if (block.type === 'list') {
		return (
			<ul key={index} className={cn('list-disc space-y-1 pl-5', compact ? 'text-[13px]' : undefined)}>
				{block.items.map((item) => (
					<li key={item} className="pl-1 text-fg-muted marker:text-fg-dim">
						{renderInline(item)}
					</li>
				))}
			</ul>
		)
	}

	if (block.type === 'code') {
		return (
			<pre
				key={index}
				className="font-data overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 text-[12px] leading-6 text-fg-muted"
			>
				{block.text}
			</pre>
		)
	}

	return (
		<p key={index} className={cn('text-fg-muted', compact ? 'text-[13px] leading-6' : undefined)}>
			{renderInline(block.text)}
		</p>
	)
}

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/

function renderInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = []
	let lastIndex = 0

	for (const match of text.matchAll(INLINE_RE)) {
		const start = match.index ?? 0
		if (start > lastIndex) {
			nodes.push(text.slice(lastIndex, start))
		}

		const token = match[0]
		const key = `${start}:${token}`
		if (token.startsWith('**') && token.endsWith('**')) {
			nodes.push(
				<strong key={key} className="font-semibold text-fg">
					{token.slice(2, -2)}
				</strong>
			)
		} else if (token.startsWith('`') && token.endsWith('`')) {
			nodes.push(
				<code
					key={key}
					className="font-data rounded border border-border bg-surface px-1 py-0.5 text-[0.92em] text-fg"
				>
					{token.slice(1, -1)}
				</code>
			)
		} else {
			const link = token.match(LINK_RE)
			if (link) {
				nodes.push(
					<a
						key={key}
						href={link[2]}
						target="_blank"
						rel="noreferrer"
						className="text-accent hover:underline"
					>
						{link[1]}
					</a>
				)
			}
		}

		lastIndex = start + token.length
	}

	if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex))
	}

	return nodes
}
