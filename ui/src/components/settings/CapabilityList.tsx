import { CapabilityBadge } from '@/components/CapabilityBadge'
import type { RuntimeCapabilities } from '@/types'

interface CapabilityListProps {
	capabilities: RuntimeCapabilities
}

const capabilityLabels: Array<{
	key: keyof RuntimeCapabilities
	label: string
	title: string
}> = [
	{ key: 'supports_pty', label: 'PTY', title: 'Interactive PTY transport' },
	{ key: 'supports_protocol', label: 'PROTO', title: 'Native protocol I/O' },
	{ key: 'supports_resume', label: 'RESUME', title: 'Resume previous session' },
	{ key: 'supports_mcp_config', label: 'MCP', title: 'MCP server configuration' },
	{ key: 'supports_structured_tools', label: 'TOOLS', title: 'Structured tool use' },
	{ key: 'supports_usage', label: 'USAGE', title: 'Reports token usage' }
]

export function CapabilityList({ capabilities }: CapabilityListProps) {
	return (
		<div className="flex flex-wrap items-center gap-1">
			{capabilityLabels.map(({ key, label, title }) => (
				<CapabilityBadge key={key} label={label} title={title} enabled={capabilities[key]} />
			))}
		</div>
	)
}
