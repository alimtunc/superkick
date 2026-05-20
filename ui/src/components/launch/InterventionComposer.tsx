import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useCreateLaunchTaskIntervention } from '@/hooks/useLaunchTaskInterventions'
import { Send } from 'lucide-react'

interface InterventionComposerProps {
	linearIssueId: string
	taskId: string
	disabled: boolean
}

export function InterventionComposer({ linearIssueId, taskId, disabled }: InterventionComposerProps) {
	const [value, setValue] = useState('')
	const create = useCreateLaunchTaskIntervention({ linearIssueId, taskId })

	const trimmed = value.trim()
	const canSend = !disabled && !create.isPending && trimmed.length > 0

	const submit = async () => {
		if (!canSend) return
		try {
			await create.mutateAsync({ body: trimmed })
			setValue('')
		} catch {
			// toast surfaces the error
		}
	}

	const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
			event.preventDefault()
			submit()
		}
	}

	const placeholder = disabled
		? 'Launch task has ended — no new interventions accepted.'
		: 'Leave a request for the next step…   ⌘↵ to send'

	return (
		<div className="border-b border-edge bg-carbon/40 px-6 py-3">
			<div className="rounded-md border border-edge bg-canvas focus-within:border-edge-bright">
				<textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					disabled={disabled || create.isPending}
					rows={2}
					aria-label="Intervention body"
					className="font-data block w-full resize-y rounded-t-md border-0 bg-transparent px-3 py-2 text-[12px] text-fog placeholder-dim focus:outline-none disabled:opacity-60"
				/>
				<div className="flex items-center justify-between gap-2 border-t border-edge px-2 py-1.5">
					<span className="font-data text-[11px] text-dim">
						Queued for the next step. Does not interrupt the active step.
					</span>
					<Button
						variant="default"
						size="icon-sm"
						disabled={!canSend}
						onClick={submit}
						className="font-data"
						title="Send intervention"
						aria-label="Send intervention"
					>
						<Send size={12} strokeWidth={2} aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	)
}
