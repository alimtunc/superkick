import { getInitials } from '@/lib/format'

interface AssigneeAvatarProps {
	name: string
	avatarUrl?: string | null
}

export function AssigneeAvatar({ name, avatarUrl }: AssigneeAvatarProps) {
	if (avatarUrl) {
		return (
			<img
				src={avatarUrl}
				alt=""
				className="size-5 shrink-0 rounded-full"
				title={name}
				aria-label={`Assigned to ${name}`}
			/>
		)
	}
	return (
		<span
			className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-slate-deep/60 text-[8px] font-medium text-silver"
			title={name}
			aria-label={`Assigned to ${name}`}
		>
			{getInitials(name)}
		</span>
	)
}
