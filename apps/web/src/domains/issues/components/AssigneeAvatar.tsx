import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface AssigneeAvatarProps {
	name: string | null
	avatarUrl?: string | null
	size?: 16 | 18 | 20 | 26
	tint?: string
	className?: string
}

const SIZE_CLASS: Record<NonNullable<AssigneeAvatarProps['size']>, string> = {
	16: 'avatar--sm',
	18: '',
	20: '',
	26: 'avatar--lg'
}

function paletteSlot(key: string): number {
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	return (h % 8) + 1
}

export function AssigneeAvatar({ name, avatarUrl, size = 20, tint, className }: AssigneeAvatarProps) {
	const sizing = SIZE_CLASS[size]
	const dim = size === 18 ? 18 : undefined

	if (name === null) {
		return (
			<span
				className={cn('avatar avatar--empty', sizing, className)}
				style={dim ? { width: dim, height: dim } : undefined}
				aria-label="Unassigned"
				title="Unassigned"
			/>
		)
	}

	if (avatarUrl) {
		return (
			<img
				src={avatarUrl}
				alt=""
				className={cn('avatar', sizing, 'object-cover', className)}
				style={dim ? { width: dim, height: dim } : undefined}
				title={name}
				aria-label={`Assigned to ${name}`}
			/>
		)
	}

	return (
		<span
			className={cn('avatar', tint ? null : `av-${paletteSlot(name)}`, sizing, className)}
			style={{
				...(dim ? { width: dim, height: dim } : undefined),
				...(tint ? { backgroundColor: tint, color: '#fff' } : undefined)
			}}
			title={name}
			aria-label={`Assigned to ${name}`}
		>
			{getInitials(name)}
		</span>
	)
}
