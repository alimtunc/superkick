import { PtyTerminal } from '@/components/run-detail/PtyTerminal'
import { TerminalTakeover } from '@/components/run-detail/TerminalTakeover'
import { FEATURES } from '@/lib/features'

interface ShellTabProps {
	runId: string
	isTerminal: boolean
}

export function ShellTab({ runId, isTerminal }: ShellTabProps) {
	if (!FEATURES.drawerTerminalTakeover) {
		return (
			<div className="space-y-2">
				<p className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
					{isTerminal ? 'Run terminal · history' : 'Run terminal · live'}
				</p>
				<PtyTerminal runId={runId} isTerminal={isTerminal} />
			</div>
		)
	}

	return (
		<div>
			<TerminalTakeover runId={runId} isTerminal={isTerminal} />
		</div>
	)
}
