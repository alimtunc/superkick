import { useEffect, useRef, useState } from 'react'

import { PtyTerminal } from '@/components/run-detail/PtyTerminal'
import { useLocation } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, TerminalSquare } from 'lucide-react'

interface TerminalTakeoverProps {
	runId: string
	isTerminal: boolean
}

export function TerminalTakeover({ runId, isTerminal }: TerminalTakeoverProps) {
	const [open, setOpen] = useState(false)
	const sectionRef = useRef<HTMLElement>(null)
	const { hash } = useLocation()

	useEffect(() => {
		if (hash !== 'terminal' && hash !== '#terminal') return
		setOpen(true)
		const raf = requestAnimationFrame(() => {
			sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		})
		return () => cancelAnimationFrame(raf)
	}, [hash])

	return (
		<section ref={sectionRef} id="terminal" className="mb-6 rounded-lg border border-edge bg-carbon">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="group flex w-full items-center gap-2 px-3 py-2 text-left"
				aria-expanded={open}
			>
				<TerminalSquare size={12} className="text-dim group-hover:text-silver" />
				<span className="font-data text-[11px] tracking-wider text-silver uppercase">
					Direct terminal access
				</span>
				<span className="font-data text-[11px] text-dim">· secondary</span>
				<span className="font-data ml-auto flex items-center gap-1 text-[10px] tracking-wider text-dim uppercase group-hover:text-silver">
					{open ? 'Hide' : 'Open'}
					{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				</span>
			</button>

			{open ? (
				<div className="border-t border-edge px-3 py-3">
					<p className="font-data mb-2 text-[11px] text-dim">
						Inspect or take over the run's PTY. For product decisions, prefer attention requests —
						they're persisted on the run.
					</p>
					<PtyTerminal runId={runId} isTerminal={isTerminal} />
				</div>
			) : null}
		</section>
	)
}
