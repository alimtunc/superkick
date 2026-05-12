import { TerminalTakeover } from '@/components/run-detail/TerminalTakeover'

interface ShellTabProps {
	runId: string
	isTerminal: boolean
}

export function ShellTab({ runId, isTerminal }: ShellTabProps) {
	return (
		<div className="px-4 py-3">
			<TerminalTakeover runId={runId} isTerminal={isTerminal} />
		</div>
	)
}
