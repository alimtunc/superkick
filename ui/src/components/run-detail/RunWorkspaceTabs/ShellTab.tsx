import { TerminalTakeover } from '@/components/run-detail/TerminalTakeover'

interface ShellTabProps {
	runId: string
	isTerminal: boolean
}

export function ShellTab({ runId, isTerminal }: ShellTabProps) {
	return (
		<div>
			<TerminalTakeover runId={runId} isTerminal={isTerminal} />
		</div>
	)
}
