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
		<section ref={sectionRef} id="terminal" className="mb-6 rounded-md border border-edge bg-carbon">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-graphite/40 focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
				aria-expanded={open}
			>
				<TerminalSquare
					size={12}
					strokeWidth={1.75}
					aria-hidden="true"
					className="text-ash group-hover:text-silver"
				/>
				<span className="font-data text-[11px] tracking-wider text-silver uppercase">
					Direct terminal access
				</span>
				<span className="font-data text-[11px] text-ash">· secondary</span>
				<span className="font-data ml-auto flex items-center gap-1 text-[10px] tracking-wider text-ash uppercase group-hover:text-silver">
					{open ? 'Hide' : 'Open'}
					{open ? (
						<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
					)}
				</span>
			</button>

			{open ? (
				<div className="border-t border-edge px-3 py-3">
					<p className="font-data mb-2 text-[11px] text-ash">
						Inspect or take over the run's PTY. For product decisions, prefer attention requests —
						they're persisted on the run.
					</p>
					<PtyTerminal runId={runId} isTerminal={isTerminal} />
				</div>
			) : null}
		</section>
	)
}
