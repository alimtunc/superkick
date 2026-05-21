import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface AssigneeAvatarProps {
	name: string | null
	avatarUrl?: string | null
	size?: 18 | 20
	className?: string
}

const SIZE_CLASS: Record<NonNullable<AssigneeAvatarProps['size']>, string> = {
	18: 'h-[18px] w-[18px]',
	20: 'h-5 w-5'
}

export function AssigneeAvatar({ name, avatarUrl, size = 20, className }: AssigneeAvatarProps) {
	const sizing = SIZE_CLASS[size]

	if (name === null) {
		return (
			<span
				className={cn(
					'flex shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-transparent',
					sizing,
					className
				)}
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
				className={cn('shrink-0 rounded-full', sizing, className)}
				title={name}
				aria-label={`Assigned to ${name}`}
			/>
		)
	}
	return (
		<span
			className={cn(
				'flex shrink-0 items-center justify-center rounded-full border border-border bg-raised text-[8px] font-medium text-fg-muted',
				sizing,
				className
			)}
			title={name}
			aria-label={`Assigned to ${name}`}
		>
			{getInitials(name)}
		</span>
	)
}
