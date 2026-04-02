import { CopyValue } from '@/components/run-detail/CopyValue'
import type { AttachPayload } from '@/types'

export function AttachPanel({ payload, onReset }: { payload: AttachPayload; onReset: () => void }) {
	const isRecovery = payload.attach_kind === 'recovery_shell'

	return (
		<div className="mt-2 space-y-2 border-t border-edge/30 pt-2">
			<div className="flex items-center justify-between">
				<span
					className={`font-data text-[11px] font-medium ${isRecovery ? 'text-oxide' : 'text-cyan'}`}
				>
					{payload.title}
				</span>
				<button
					type="button"
					onClick={onReset}
					className="font-data text-[10px] text-dim transition-colors hover:text-fog"
				>
					Dismiss
				</button>
			</div>
			<p className="font-data text-[10px] text-silver/60">{payload.summary}</p>

			<div className="space-y-1.5">
				<div>
					<span className="font-data text-[9px] text-dim uppercase">Command</span>
					<CopyValue
						value={payload.command}
						className="font-data mt-0.5 block text-[10px] text-fog/80"
					/>
				</div>
				<div>
					<span className="font-data text-[9px] text-dim uppercase">Worktree</span>
					<CopyValue
						value={payload.worktree_path}
						className="font-data mt-0.5 block text-[10px] text-fog/80"
					/>
				</div>
			</div>

			<ul className="space-y-0.5">
				{payload.limitations.map((lim) => (
					<li key={lim} className="font-data text-[9px] text-dim">
						&bull; {lim}
					</li>
				))}
			</ul>
		</div>
	)
}
