import { useEffect, useRef, useState } from 'react'

import { takeoverWsUrl } from '@/api'
import { PtyTerminal } from '@/components/run-detail/PtyTerminal'
import { TerminalTakeoverModeButton } from '@/components/run-detail/TerminalTakeoverModeButton'
import { Button } from '@/components/ui/button'
import { MENU_ITEM_CLASS, MenuPopup } from '@/components/ui/menu-shell'
import {
	useActiveTakeovers,
	useCloseTakeover,
	useOpenTakeover,
	useTakeoverModes
} from '@/hooks/useTerminalTakeover'
import type { ForceTakeoverSubMode, OpenedTakeover, TakeoverModeKind, TakeoverPath } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { useLocation } from '@tanstack/react-router'
import { Check, ChevronDown, ChevronRight, Eye, MessageCircle, Power, TerminalSquare } from 'lucide-react'

interface TerminalTakeoverProps {
	runId: string
	isTerminal: boolean
}

const FORCE_SUB_MODES: readonly ForceTakeoverSubMode[] = ['inspect', 'interactive_continuation']

const FORCE_SUB_MODE_LABEL: Record<ForceTakeoverSubMode, string> = {
	inspect: 'Inspect (read-only shell)',
	interactive_continuation: 'Interactive continuation (CLI)'
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

const PATH_LABEL: Record<TakeoverPath, string> = {
	attach: 'Attached',
	resume: 'Resumed',
	fresh: 'Fresh + snapshot'
}

const PATH_COPY: Record<TakeoverPath, string> = {
	attach: 'Joined the live agent session — you share its terminal. Detaching does not stop the agent.',
	resume: 'Provider session resumed via --resume. The prior conversation was restored.',
	fresh: 'Fresh interactive session in the worktree, seeded with the redacted run-context snapshot.'
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
		<section ref={sectionRef} id="terminal" className="mb-6 space-y-3">
			<div className="space-y-2">
				<p className="font-data text-[10px] tracking-wider text-fg-dim uppercase">Run-primary PTY</p>
				<PtyTerminal runId={runId} isTerminal={isTerminal} />
			</div>

			<div className="rounded-md border border-border bg-surface">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface/40 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
					aria-expanded={open}
				>
					<TerminalSquare
						size={12}
						strokeWidth={1.75}
						aria-hidden="true"
						className="text-fg-dim group-hover:text-fg-muted"
					/>
					<span className="font-data text-[11px] tracking-wider text-fg-muted uppercase">
						Take over terminal
					</span>
					<span className="font-data text-[11px] text-fg-dim">· inspect / continue / force</span>
					<span className="font-data ml-auto flex items-center gap-1 text-[10px] tracking-wider text-fg-dim uppercase group-hover:text-fg-muted">
						{open ? 'Hide' : 'Open'}
						{open ? (
							<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
						) : (
							<ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
						)}
					</span>
				</button>

				{open ? (
					<div className="space-y-3 border-t border-border p-3">
						<p className="font-data text-[11px] text-fg-dim">
							Pick how you want to take the terminal. Force takeover cancels the active protocol
							turn. Use it sparingly and prefer attention requests for product decisions.
						</p>

						{activeTakeover && wsUrl ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<span className="font-data text-[10px] tracking-wider text-fg-muted uppercase">
										Active takeover
									</span>
									<span className="font-data text-[10px] text-fg-dim">
										· {modeLabel(activeTakeover.mode)}
									</span>
									{activeTakeover.takeover_path ? (
										<span className="font-data text-[10px] tracking-wider text-success uppercase">
											· {PATH_LABEL[activeTakeover.takeover_path]}
										</span>
									) : null}
									<Button
										type="button"
										variant="outline"
										size="xs"
										onClick={handleClose}
										disabled={closing}
										className="font-data ml-auto h-auto rounded-sm border-border bg-surface/40 px-2 py-1 text-[10px] tracking-wider text-fg-muted uppercase hover:border-danger/40 hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/40"
									>
										{activeTakeover.takeover_path === 'attach'
											? 'Detach'
											: 'Close takeover'}
									</Button>
								</div>
								{activeTakeover.takeover_path ? (
									<p className="font-data text-[10px] text-fg-dim">
										{PATH_COPY[activeTakeover.takeover_path]}
									</p>
								) : null}
								{activeTakeover.takeover_path === 'attach' ? (
									<p className="font-data text-[10px] text-fg-dim italic">
										Streaming the run-primary PTY below.
									</p>
								) : (
									<PtyTerminal
										runId={runId}
										isTerminal={false}
										wsUrl={wsUrl}
										loadHistoryOnTerminal={false}
									/>
								)}
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
							<div className="space-y-2 rounded-md border border-danger/40 bg-danger/10 p-3">
								<p className="font-data text-[11px] tracking-wider text-danger uppercase">
									Confirm force takeover
								</p>
								<p className="font-data text-[11px] text-fg-muted">
									This cancels the current agent turn (the in-flight protocol response is
									discarded) and writes a TerminalTakeoverOpened event to the run ledger.
								</p>
								<div className="font-data flex flex-col gap-1 text-[10px] tracking-wider text-fg-dim uppercase">
									Sub-mode
									<Menu.Root>
										<Menu.Trigger className="font-data inline-flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-2 py-1 text-[11px] text-fg-muted normal-case focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none">
											{FORCE_SUB_MODE_LABEL[pendingForceSubMode]}
											<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
										</Menu.Trigger>
										<MenuPopup
											align="start"
											popupClassName="font-data w-64 border-border bg-surface"
										>
											<Menu.RadioGroup
												value={pendingForceSubMode}
												onValueChange={(next) =>
													setPendingForceSubMode(next as ForceTakeoverSubMode)
												}
											>
												{FORCE_SUB_MODES.map((subMode) => (
													<Menu.RadioItem
														key={subMode}
														value={subMode}
														className={MENU_ITEM_CLASS}
													>
														<span className="flex-1 normal-case">
															{FORCE_SUB_MODE_LABEL[subMode]}
														</span>
														<Menu.RadioItemIndicator className="text-fg">
															<Check
																size={12}
																strokeWidth={2}
																aria-hidden="true"
															/>
														</Menu.RadioItemIndicator>
													</Menu.RadioItem>
												))}
											</Menu.RadioGroup>
										</MenuPopup>
									</Menu.Root>
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="xs"
										onClick={() => handleConfirmForce(pendingForceSubMode)}
										disabled={openMutation.isPending}
										className="font-data h-auto rounded-sm border-danger/60 bg-danger/20 px-2 py-1 text-[10px] tracking-wider text-danger uppercase hover:border-danger hover:bg-danger/30 focus-visible:ring-2 focus-visible:ring-danger/40"
									>
										Cancel turn & take over
									</Button>
									<Button
										type="button"
										variant="outline"
										size="xs"
										onClick={() => setPendingForceSubMode(null)}
										className="font-data h-auto rounded-sm border-border bg-surface/40 px-2 py-1 text-[10px] tracking-wider text-fg-muted uppercase hover:border-success/40 focus-visible:ring-2 focus-visible:ring-success/40"
									>
										Back
									</Button>
								</div>
							</div>
						) : null}

						{errorMessage ? (
							<p className="font-data text-[11px] text-danger">{errorMessage}</p>
						) : null}
					</div>
				) : null}
			</div>
		</section>
	)
}
