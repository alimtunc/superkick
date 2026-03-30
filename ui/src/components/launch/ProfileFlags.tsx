import type { LaunchProfile } from '@/types'

export function ProfileFlags({ profile }: { profile: LaunchProfile }) {
	const flags = [
		profile.use_worktree ? 'Worktree' : null,
		profile.live_mode ? 'Live mode' : null,
		...profile.skills
	].filter((f): f is string => f !== null)

	if (flags.length === 0) return null

	return (
		<div className="flex flex-wrap gap-1.5">
			{flags.map((flag) => (
				<span
					key={flag}
					className="font-data inline-block rounded bg-edge/30 px-1.5 py-0.5 text-[10px] text-dim"
				>
					{flag}
				</span>
			))}
		</div>
	)
}
