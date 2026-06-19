import { Icon } from '@/components/primitives'
import { AgentAvatarBadge } from '@/domains/agents/components/AgentAvatarBadge'
import {
	AGENT_AVATAR_COLORS,
	AGENT_AVATAR_EMOJIS,
	AGENT_AVATAR_ICONS,
	DEFAULT_AGENT_AVATAR
} from '@/lib/agentAvatar'
import { cn } from '@/lib/utils'
import type { AgentAvatar } from '@/types'

interface AgentAvatarPickerProps {
	value: AgentAvatar | null
	name: string
	onChange: (avatar: AgentAvatar) => void
}

const GLYPH_BTN =
	'flex h-7 w-7 items-center justify-center rounded-[6px] border border-border bg-raised text-[15px] leading-none hover:border-accent'

export function AgentAvatarPicker({ value, name, onChange }: AgentAvatarPickerProps) {
	const current = value ?? DEFAULT_AGENT_AVATAR

	function setIcon(icon: string) {
		onChange({ icon, color: current.color })
	}

	function setColor(color: string) {
		onChange({ icon: current.icon, color })
	}

	return (
		<div className="flex gap-3">
			<AgentAvatarBadge avatar={current} name={name} size={48} />
			<div className="flex flex-1 flex-col gap-2">
				<div className="flex flex-wrap gap-1.5">
					{AGENT_AVATAR_EMOJIS.map((emoji) => (
						<button
							key={emoji}
							type="button"
							className={cn(GLYPH_BTN, current.icon === emoji && 'border-accent')}
							aria-label={`Use ${emoji} avatar`}
							aria-pressed={current.icon === emoji}
							onClick={() => setIcon(emoji)}
						>
							{emoji}
						</button>
					))}
					{AGENT_AVATAR_ICONS.map((icon) => (
						<button
							key={icon}
							type="button"
							className={cn(GLYPH_BTN, current.icon === icon && 'border-accent')}
							aria-label={`Use ${icon} icon avatar`}
							aria-pressed={current.icon === icon}
							onClick={() => setIcon(icon)}
						>
							<Icon name={icon} size={15} />
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-1.5">
					{AGENT_AVATAR_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={cn(
								'h-6 w-6 rounded-full border-2',
								current.color === color ? 'border-fg' : 'border-transparent'
							)}
							style={{ background: color }}
							aria-label={`Use color ${color}`}
							aria-pressed={current.color === color}
							onClick={() => setColor(color)}
						/>
					))}
				</div>
			</div>
		</div>
	)
}
