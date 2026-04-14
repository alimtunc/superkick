import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRaiseAttentionRequest } from '@/hooks/useRaiseAttentionRequest'
import { extractFormError } from '@/lib/domain'
import type { AttentionKind } from '@/types'

const KINDS: readonly AttentionKind[] = ['clarification', 'decision', 'approval']

/**
 * Operator-side affordance to raise an attention request against a run — useful
 * for dogfooding and for manually escalating a question the agent didn't raise
 * itself. Agents can also POST to the same endpoint programmatically.
 */
export function RaiseAttentionRequestForm({ runId, onCreated }: { runId: string; onCreated: () => void }) {
	const { form, open, setOpen, close } = useRaiseAttentionRequest(runId, onCreated)

	if (!open) {
		return (
			<Button
				variant="outline"
				size="xs"
				onClick={() => setOpen(true)}
				className="font-data border-edge bg-carbon text-[11px] text-dim hover:text-fog"
			>
				+ raise request
			</Button>
		)
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				form.handleSubmit()
			}}
			className="panel border border-edge p-3"
		>
			<div className="space-y-2">
				<form.Field name="kind">
					{(field) => (
						<div className="flex gap-2">
							{KINDS.map((k) => (
								<Button
									key={k}
									type="button"
									variant="outline"
									size="xs"
									onClick={() => field.handleChange(k)}
									className={`font-data text-[10px] tracking-wider uppercase ${
										field.state.value === k
											? 'border-gold/60 bg-gold/15 text-gold'
											: 'border-edge bg-carbon text-dim'
									}`}
								>
									{k}
								</Button>
							))}
						</div>
					)}
				</form.Field>

				<form.Field name="title">
					{(field) => (
						<Input
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder="Title"
							className="font-data border-edge bg-carbon text-[12px] text-fog"
						/>
					)}
				</form.Field>

				<form.Field name="body">
					{(field) => (
						<Input
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder="Details"
							className="font-data border-edge bg-carbon text-[12px] text-fog"
						/>
					)}
				</form.Field>

				<form.Subscribe selector={(s) => s.values.kind}>
					{(kind) =>
						kind === 'decision' ? (
							<form.Field name="optionsText">
								{(field) => (
									<Input
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Options, comma-separated"
										className="font-data border-edge bg-carbon text-[12px] text-fog"
									/>
								)}
							</form.Field>
						) : null
					}
				</form.Subscribe>

				<form.Subscribe selector={(s) => s.errorMap.onSubmit}>
					{(onSubmitError) => {
						const message = extractFormError(onSubmitError)
						return message ? (
							<p className="font-data rounded bg-oxide-dim p-2 text-[12px] text-oxide">
								{message}
							</p>
						) : null
					}}
				</form.Subscribe>

				<form.Subscribe selector={(s) => [s.isSubmitting, s.values.title] as const}>
					{([isSubmitting, title]) => (
						<div className="flex gap-2">
							<Button
								type="submit"
								variant="outline"
								size="xs"
								disabled={isSubmitting || title.trim().length === 0}
								className="font-data border-mineral/30 bg-mineral-dim text-[11px] text-mineral"
							>
								RAISE
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={close}
								className="font-data text-[11px] text-dim"
							>
								cancel
							</Button>
						</div>
					)}
				</form.Subscribe>
			</div>
		</form>
	)
}
