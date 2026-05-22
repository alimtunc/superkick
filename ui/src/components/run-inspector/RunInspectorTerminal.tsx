import { useEffect, useState } from 'react'

import { TerminalTakeover } from '@/components/run-detail/TerminalTakeover'
import { useLocation } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, TerminalSquare } from 'lucide-react'

interface RunInspectorTerminalProps {
	runId: string
	isTerminal: boolean
}

export function RunInspectorTerminal({ runId, isTerminal }: RunInspectorTerminalProps) {
	const { hash } = useLocation()
	const [open, setOpen] = useState(false)

	useEffect(() => {
		if (hash === 'terminal' || hash === '#terminal') setOpen(true)
	}, [hash])

	const Chevron = open ? ChevronDown : ChevronUp

	return (
		<section className="flex shrink-0 flex-col border-t border-edge bg-surface" aria-label="Terminal">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-controls="run-inspector-terminal-panel"
				className="flex items-center gap-2 px-6 py-2 text-[12px] text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				<TerminalSquare size={13} strokeWidth={1.75} aria-hidden="true" />
				<span className="font-data tracking-wide">Terminal</span>
				<span className="font-data text-[11px] text-fg-dim">{open ? 'collapse' : 'expand'}</span>
				<Chevron size={12} strokeWidth={1.85} aria-hidden="true" className="ml-auto" />
			</button>
			{open ? (
				<div id="run-inspector-terminal-panel" className="border-t border-edge">
					<TerminalTakeover runId={runId} isTerminal={isTerminal} />
				</div>
			) : null}
		</section>
	)
}
