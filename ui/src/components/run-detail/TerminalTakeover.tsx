import { useEffect, useRef, useState } from 'react'

import { takeoverWsUrl } from '@/api'
import { PtyTerminal } from '@/components/run-detail/PtyTerminal'
import { TerminalTakeoverModeButton } from '@/components/run-detail/TerminalTakeoverModeButton'
import {
	useActiveTakeovers,
	useCloseTakeover,
	useOpenTakeover,
	useTakeoverModes
} from '@/hooks/useTerminalTakeover'
import type { ForceTakeoverSubMode, OpenedTakeover, TakeoverModeKind } from '@/types'
import { useLocation } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Eye, MessageCircle, Power, TerminalSquare } from 'lucide-react'

interface TerminalTakeoverProps {
	runId: string
	isTerminal: boolean
}

const MODE_DESCRIPTION: Record<TakeoverModeKind, string> = {
	inspect: 'New shell in the run worktree. Does not interact with the agent.',
	interactive_continuation:
		'Provider CLI in interactive mode. Resumes the conversation when the adapter supports it.',
	force_takeover:
		'Cancel the in-flight protocol turn, then enter inspect or continuation. Discards the turn.'
}

function modeIcon(mode: TakeoverModeKind) {
	if (mode === 'inspect') return <Eye size={14} strokeWidth={1.75} />
	if (mode === 'interactive_continuation') return <MessageCircle size={14} strokeWidth={1.75} />
	return <Power size={14} strokeWidth={1.75} />
}

function modeLabel(mode: TakeoverModeKind): string {
	if (mode === 'inspect') return 'Inspect'
	if (mode === 'interactive_continuation') return 'Continue'
	return 'Force takeover'
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

	const modesQuery = useTakeoverModes(runId, open)
	const activeQuery = useActiveTakeovers(runId, open)
	const openMutation = useOpenTakeover(runId)
	const { close: closeTakeover, pending: closing } = useCloseTakeover(runId)

	const [activeTakeover, setActiveTakeover] = useState<OpenedTakeover | null>(null)
	const [pendingForceSubMode, setPendingForceSubMode] = useState<ForceTakeoverSubMode | null>(null)

	const modes = modesQuery.data?.modes ?? []
	const latestPersisted = activeQuery.data?.takeovers[0] ?? null
	const latestPersistedId = latestPersisted?.takeover_session_id ?? null
	const latestPersistedMode = latestPersisted?.mode ?? null

	// Re-anchor to the most recent persisted takeover on reload so context survives.
	useEffect(() => {
		if (activeTakeover) return
		if (!latestPersistedId || !latestPersistedMode) return
		setActiveTakeover({
			takeover_session_id: latestPersistedId,
			mode: latestPersistedMode,
			resume_attempted: false,
			terminal_ws: takeoverWsUrl(runId, latestPersistedId)
		})
	}, [activeTakeover, latestPersistedId, latestPersistedMode, runId])

	const handleSelectMode = (mode: TakeoverModeKind) => {
		if (mode === 'force_takeover') {
			setPendingForceSubMode('inspect')
			return
		}
		openMutation
			.mutateAsync({ mode })
			.then((opened) => setActiveTakeover(opened))
			.catch(() => {
				/* error surfaces via openMutation.error */
			})
	}

	const handleConfirmForce = (subMode: ForceTakeoverSubMode) => {
		setPendingForceSubMode(null)
		openMutation
			.mutateAsync({ mode: 'force_takeover', sub_mode: subMode, confirm_force: true })
			.then((opened) => setActiveTakeover(opened))
			.catch(() => {
				/* error surfaces via openMutation.error */
			})
	}

	const handleClose = async () => {
		if (!activeTakeover) return
		await closeTakeover(activeTakeover.takeover_session_id)
		setActiveTakeover(null)
	}

	const wsUrl = activeTakeover?.terminal_ws ?? null

	const errorMessage = openMutation.error?.message ?? null

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
				<span className="font-data text-[11px] text-ash">
					· {isTerminal ? 'history + takeover' : 'primary + takeover'}
				</span>
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
				<div className="space-y-3 border-t border-edge p-3">
					<p className="font-data text-[11px] text-ash">
						Pick how you want to take the terminal. Force takeover cancels the active protocol
						turn — use it sparingly and prefer attention requests for product decisions.
					</p>

					{activeTakeover && wsUrl ? (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<span className="font-data text-[10px] tracking-wider text-silver uppercase">
									Active takeover
								</span>
								<span className="font-data text-[10px] text-ash">
									· {modeLabel(activeTakeover.mode)}
								</span>
								<button
									type="button"
									onClick={handleClose}
									disabled={closing}
									className="font-data hover:border-rust/40 hover:text-rust focus-visible:ring-rust/40 ml-auto inline-flex items-center gap-1 rounded-sm border border-edge bg-graphite/40 px-2 py-1 text-[10px] tracking-wider text-silver uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								>
									Close takeover
								</button>
							</div>
							<PtyTerminal
								runId={runId}
								isTerminal={false}
								wsUrl={wsUrl}
								loadHistoryOnTerminal={false}
							/>
						</div>
					) : null}

					{!activeTakeover && pendingForceSubMode === null ? (
						<div className="grid gap-2">
							{modes.map((availability) => (
								<TerminalTakeoverModeButton
									key={availability.mode}
									availability={availability}
									icon={modeIcon(availability.mode)}
									label={modeLabel(availability.mode)}
									description={MODE_DESCRIPTION[availability.mode]}
									pending={openMutation.isPending}
									onSelect={handleSelectMode}
								/>
							))}
						</div>
					) : null}

					{pendingForceSubMode !== null ? (
						<div className="border-rust/40 bg-rust/10 space-y-2 rounded-md border p-3">
							<p className="font-data text-rust text-[11px] tracking-wider uppercase">
								Confirm force takeover
							</p>
							<p className="font-data text-[11px] text-silver">
								This cancels the current agent turn (the in-flight protocol response is
								discarded) and writes a TerminalTakeoverOpened event to the run ledger.
							</p>
							<label className="font-data flex flex-col gap-1 text-[10px] tracking-wider text-ash uppercase">
								Sub-mode
								<select
									value={pendingForceSubMode}
									onChange={(e) =>
										setPendingForceSubMode(e.target.value as ForceTakeoverSubMode)
									}
									className="font-data rounded-sm border border-edge bg-carbon px-2 py-1 text-[11px] text-silver normal-case focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
								>
									<option value="inspect">Inspect (read-only shell)</option>
									<option value="interactive_continuation">
										Interactive continuation (CLI)
									</option>
								</select>
							</label>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => handleConfirmForce(pendingForceSubMode)}
									disabled={openMutation.isPending}
									className="font-data border-rust/60 bg-rust/20 text-rust hover:border-rust hover:bg-rust/30 focus-visible:ring-rust/40 inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] tracking-wider uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								>
									Cancel turn & take over
								</button>
								<button
									type="button"
									onClick={() => setPendingForceSubMode(null)}
									className="font-data inline-flex items-center gap-1 rounded-sm border border-edge bg-graphite/40 px-2 py-1 text-[10px] tracking-wider text-silver uppercase transition-colors hover:border-mineral/40 focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
								>
									Back
								</button>
							</div>
						</div>
					) : null}

					{errorMessage ? <p className="font-data text-rust text-[11px]">{errorMessage}</p> : null}

					<div className="space-y-2">
						<p className="font-data text-[10px] tracking-wider text-ash uppercase">
							Run-primary PTY
						</p>
						<PtyTerminal runId={runId} isTerminal={isTerminal} />
					</div>
				</div>
			) : null}
		</section>
	)
}
