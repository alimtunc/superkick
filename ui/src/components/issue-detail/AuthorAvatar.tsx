import { agentColor } from '@/lib/domain'

interface AuthorAvatarProps {
	name: string
	avatarUrl: string | null
	size?: number
}

export function AuthorAvatar({ name, avatarUrl, size = 26 }: AuthorAvatarProps) {
	const dimension = { width: size, height: size }
	if (avatarUrl) {
		return <img src={avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={dimension} />
	}

	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase()

	const hue = agentColor(name)
	return (
		<span
			className="flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.2px] text-white"
			style={{ ...dimension, fontSize: Math.round(size * 0.42), background: hue }}
		>
			{initials}
		</span>
	)
}
