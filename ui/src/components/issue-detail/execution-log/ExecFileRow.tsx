import { cn } from '@/lib/utils'
import type { ExecFileChange } from '@/types'
import { Icon } from '@/ui'

interface ExecFileRowProps {
	file: ExecFileChange
}

function StackedBar({ adds, dels }: { adds: number; dels: number }) {
	const total = adds + dels
	const addsPct = total === 0 ? 0 : Math.round((adds / total) * 100)
	return (
		<span
			className="inline-flex h-1 w-[56px] shrink-0 overflow-hidden rounded-full bg-border"
			aria-hidden="true"
		>
			<span className="h-full bg-success" style={{ width: `${addsPct}%` }} />
			<span className="h-full bg-danger" style={{ width: `${100 - addsPct}%` }} />
		</span>
	)
}

export function ExecFileRow({ file }: ExecFileRowProps) {
	const hasCounts = file.adds !== null && file.dels !== null

	return (
		<div className="flex items-center gap-2 text-[11.5px]">
			<Icon name="doc" size={11} className="shrink-0 text-fg-dim" />
			<span
				className={cn(
					'font-data min-w-0 flex-1 truncate text-[11px]',
					file.active ? 'text-accent' : 'text-fg'
				)}
			>
				{file.path}
			</span>
			{hasCounts ? (
				<>
					<StackedBar adds={file.adds ?? 0} dels={file.dels ?? 0} />
					<span className="font-data min-w-[22px] shrink-0 text-right text-[10.5px] text-success">
						+{file.adds}
					</span>
					<span className="font-data min-w-[22px] shrink-0 text-right text-[10.5px] text-danger">
						−{file.dels}
					</span>
				</>
			) : null}
		</div>
	)
}
