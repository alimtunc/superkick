import type { TerminalCapabilities, TerminalStatus } from '@/types'

interface TerminalStatusBarProps {
	status: TerminalStatus
	capabilities: TerminalCapabilities | null
}

export function TerminalStatusBar({ status, capabilities }: TerminalStatusBarProps) {
	const label = (() => {
		switch (status) {
			case 'connecting':
				return 'Connecting…'
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
				return 'bg-success'
			case 'readonly':
				return 'bg-warn'
			case 'connecting':
				return 'bg-info animate-pulse'
			default:
				return 'bg-fg-dim'
		}
	})()

	return (
		<div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
			<span className={`inline-block size-2 rounded-full ${dotColor}`} aria-hidden="true" />
			<span className="font-data text-[11px] text-fg-muted">{label}</span>
		</div>
	)
}
