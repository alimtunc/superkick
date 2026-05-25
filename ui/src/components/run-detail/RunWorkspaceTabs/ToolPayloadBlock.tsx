import { Copy } from 'lucide-react'

interface ToolPayloadBlockProps {
	label: string
	value: string
	tone?: 'default' | 'error'
}

export function ToolPayloadBlock({ label, value, tone = 'default' }: ToolPayloadBlockProps) {
	const onCopy = () => {
		void navigator.clipboard?.writeText(value)
	}
	const preTone = tone === 'error' ? 'text-oxide' : 'text-fg'
	return (
		<div>
			<div className="mb-1 flex items-center gap-2">
				<span className="font-data text-[10.5px] tracking-widest text-fg-dim uppercase">{label}</span>
				<button
					type="button"
					onClick={onCopy}
					className="inline-flex h-5 items-center gap-1 rounded px-1 text-[10.5px] text-fg-dim hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label={`Copy ${label}`}
				>
					<Copy size={10} strokeWidth={1.85} aria-hidden="true" />
				</button>
			</div>
			<pre
				className={`bg-ink overflow-x-auto rounded border border-edge px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${preTone}`}
			>
				{value || '(empty)'}
			</pre>
		</div>
	)
}
