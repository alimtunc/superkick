import { useEffect, useRef, useState } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'
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
		<section ref={sectionRef} id="terminal" className="mb-6">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="group flex w-full items-center justify-between py-1"
				aria-expanded={open}
			>
				<span className="flex items-center gap-2">
					<SectionTitle title="TERMINAL TAKEOVER" />
				</span>
				<span className="font-data flex items-center gap-1.5 text-[10px] tracking-wider text-dim uppercase group-hover:text-silver">
					<TerminalSquare size={12} />
					{open ? 'Hide' : 'Open'}
					{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				</span>
			</button>
			{open ? (
				<div className="mt-2">
					<p className="font-data mb-2 text-[11px] text-dim">
						Direct PTY interaction with the run's agent. Prefer attention requests above for
						structured product-level decisions.
					</p>
					<PtyTerminal runId={runId} isTerminal={isTerminal} />
				</div>
			) : (
				<p className="font-data mt-1 text-[11px] text-dim">
					Secondary inspect/takeover surface. Expand to attach to the live PTY.
				</p>
			)}
		</section>
	)
}
