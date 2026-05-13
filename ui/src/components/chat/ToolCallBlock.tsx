import { Disclosure } from '@/components/ui/disclosure'
import type { ToolCallEntry } from '@/types'

function safeStringify(value: unknown, pretty = true): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, pretty ? 2 : 0)
	} catch {
		return String(value)
	}
}

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max)}…` : value
}

export function ToolCallBlock({ call }: { call: ToolCallEntry }) {
	const hasOutput = call.output !== null
	const summary = truncate(safeStringify(call.input, false), 60)

	return (
		<Disclosure
			header={(open) => (
				<>
					<span className="text-cyan uppercase">tool</span>
					<span className="truncate text-fog">{call.tool_name}</span>
					{call.is_error ? (
						<span className="rounded bg-oxide-dim px-1.5 py-0.5 text-[10px] text-oxide">
							error
						</span>
					) : null}
					{!hasOutput ? (
						<span className="rounded bg-cyan-dim px-1.5 py-0.5 text-[10px] text-cyan">
							running…
						</span>
					) : null}
					{!open && summary ? (
						<span className="ml-auto truncate text-[10px] text-dim">{summary}</span>
					) : null}
				</>
			)}
		>
			<div className="space-y-2">
				<pre className="wrap-break-word whitespace-pre-wrap text-dim">
					input: {safeStringify(call.input)}
				</pre>
				{hasOutput ? (
					<pre className="wrap-break-word whitespace-pre-wrap text-mineral">
						output: {safeStringify(call.output)}
					</pre>
				) : null}
			</div>
		</Disclosure>
	)
}
