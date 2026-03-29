export function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
	if (avatarUrl) {
		return <img src={avatarUrl} alt="" className="mt-0.5 size-5 shrink-0 rounded-full" />
	}

	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase()

	return (
		<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-edge text-[9px] font-medium text-dim">
			{initials}
		</span>
	)
}
