import type { ReactNode } from 'react'

import { CopyValue } from '@/components/run-detail/CopyValue'
import { Tooltip } from '@/components/ui/tooltip'

const chipBase =
	'font-data inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[11px] leading-none text-silver'

export { chipBase }

const CLAMP_MAX = 20

function clampLabel(label: string): string {
	return label.length > CLAMP_MAX ? `${label.slice(0, CLAMP_MAX)}…` : label
}

export function Chip({ icon, label, copyValue }: { icon: ReactNode; label: string; copyValue?: string }) {
	const isClamped = label.length > CLAMP_MAX
	const tooltipLabel = isClamped ? label : undefined

	const display = (
		<>
			<span className="shrink-0 text-dim">{icon}</span>
			<span>{clampLabel(label)}</span>
		</>
	)

	if (copyValue) {
		return (
			<Tooltip label={tooltipLabel}>
				<span className="inline-flex">
					<CopyValue
						value={copyValue}
						display={display}
						hideIcon
						className={`${chipBase} cursor-pointer transition-colors hover:bg-white/8`}
					/>
				</span>
			</Tooltip>
		)
	}

	return (
		<Tooltip label={tooltipLabel}>
			<span className={chipBase}>{display}</span>
		</Tooltip>
	)
}
