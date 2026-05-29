import { PopoverPopup } from '@/components/ui/popover-shell'

import { PopBody, Popline } from './popoverParts'

interface EstimateInputProps {
	current: number | null
	onApply: (next: number | null) => void
}

const ESTIMATE_VALUES: number[] = [0, 1, 2, 3, 5, 8]

export function EstimateInput({ current, onApply }: EstimateInputProps) {
	return (
		<PopoverPopup popupClassName="w-[180px] p-0">
			<PopBody ariaLabel="Estimate">
				{ESTIMATE_VALUES.map((value) => (
					<Popline key={value} selected={value === current} onClick={() => onApply(value)}>
						<span className="font-data">{value} pts</span>
					</Popline>
				))}
				<Popline dim selected={current === null} onClick={() => onApply(null)}>
					No estimate
				</Popline>
			</PopBody>
		</PopoverPopup>
	)
}
