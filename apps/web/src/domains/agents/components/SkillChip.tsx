import { Icon } from '@/components/primitives'
interface SkillChipProps {
	label: string
	onRemove?: () => void
}

/** A skill pill shown in the cockpit (read-only) and the editor's SkillPicker
 *  (removable). Pass `onRemove` to render the remove affordance. */
export function SkillChip({ label, onRemove }: SkillChipProps) {
	return (
		<span className="inline-flex items-center gap-1 rounded-[6px] border border-border bg-raised px-2 py-0.5 text-[12px] text-fg">
			{label}
			{onRemove ? (
				<button
					type="button"
					className="text-fg-dim hover:text-fg"
					aria-label={`Remove ${label}`}
					onClick={onRemove}
				>
					<Icon name="x" size={12} className="ic" />
				</button>
			) : null}
		</span>
	)
}
