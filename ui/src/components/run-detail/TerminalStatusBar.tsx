type TerminalStatus = 'connecting' | 'live' | 'readonly' | 'ended' | 'history'

interface Capabilities {
	writable: boolean
	reason: string
}

interface TerminalStatusBarProps {
	status: TerminalStatus
	capabilities: Capabilities | null
}

export function TerminalStatusBar({ status, capabilities }: TerminalStatusBarProps) {
	const label = (() => {
		switch (status) {
			case 'connecting':
				return 'Connecting...'
			case 'live':
				return 'LIVE — Terminal attached'
			case 'readonly':
				return `READ-ONLY — ${capabilities?.reason ?? 'observer mode'}`
			case 'ended':
				return 'Session ended'
			case 'history':
				return 'Terminal history (read-only)'
		}
	})()

	const dotColor = (() => {
		switch (status) {
			case 'live':
				return 'bg-mineral'
			case 'readonly':
				return 'bg-gold'
			case 'connecting':
				return 'bg-cyan animate-pulse'
			default:
				return 'bg-dim'
		}
	})()

	return (
		<div className="flex items-center gap-2 border-b border-edge bg-carbon px-3 py-1.5">
			<span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
			<span className="font-data text-[11px] text-silver">{label}</span>
		</div>
	)
}

export type { Capabilities, TerminalStatus }
