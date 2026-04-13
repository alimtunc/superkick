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
				return 'bg-emerald-400'
			case 'readonly':
				return 'bg-amber-400'
			case 'connecting':
				return 'bg-blue-400 animate-pulse'
			default:
				return 'bg-zinc-500'
		}
	})()

	return (
		<div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
			<span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
			<span className="font-data text-[11px] text-silver">{label}</span>
		</div>
	)
}

export type { Capabilities, TerminalStatus }
