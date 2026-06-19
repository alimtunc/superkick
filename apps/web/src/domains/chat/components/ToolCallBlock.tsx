import { Disclosure } from '@/components/primitives'
import { truncate } from '@/lib/format'
import { stringifyForDisplay } from '@/lib/format/json'
import type { ToolCallEntry } from '@/types'

interface ToolCallHeaderProps {
	open: boolean
	call: ToolCallEntry
	hasOutput: boolean
	summary: string
}

function ToolCallHeader({ open, call, hasOutput, summary }: ToolCallHeaderProps) {
	return (
		<>
			<span className="text-info uppercase">tool</span>
			<span className="truncate text-fg">{call.tool_name}</span>
			{call.is_error ? (
				<span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] text-danger">error</span>
			) : null}
			{!hasOutput ? (
				<span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] text-info">running…</span>
			) : null}
			{!open && summary ? (
				<span className="ml-auto truncate text-[10px] text-fg-dim">{summary}</span>
			) : null}
		</>
	)
}

function toolCallHeader(call: ToolCallEntry, hasOutput: boolean, summary: string) {
	return (open: boolean) => (
		<ToolCallHeader open={open} call={call} hasOutput={hasOutput} summary={summary} />
	)
}

export function ToolCallBlock({ call }: { call: ToolCallEntry }) {
	const hasOutput = call.output !== null
	const summary = truncate(stringifyForDisplay(call.input, false), 61)

	return (
		<Disclosure header={toolCallHeader(call, hasOutput, summary)}>
			<div className="space-y-2">
				<pre className="wrap-break-word whitespace-pre-wrap text-fg-dim">
					input: {stringifyForDisplay(call.input)}
				</pre>
				{hasOutput ? (
					<pre className="wrap-break-word whitespace-pre-wrap text-success">
						output: {stringifyForDisplay(call.output)}
					</pre>
				) : null}
			</div>
		</Disclosure>
	)
}
