import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useInterruptForm } from '@/hooks/useInterruptForm'
import { extractFormError } from '@/lib/domain'
import type { Interrupt } from '@/types'

export function PendingInterrupt({
	runId,
	interrupt,
	onAnswered
}: {
	runId: string
	interrupt: Interrupt
	onAnswered: () => void
}) {
	const { form, retry, abort, continueWithNote } = useInterruptForm(runId, interrupt.id, onAnswered)
	const isSubmitting = form.state.isSubmitting
	const onSubmitError = form.state.errorMap.onSubmit
	const formError = extractFormError(onSubmitError)

	return (
		<div className="panel glow-gold border-l-2 border-l-warn p-4">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-warn">!!</span>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-fg">{interrupt.question}</p>
					<p className="font-data mt-1 text-[10px] text-fg-dim">
						{new Date(interrupt.created_at).toLocaleString()}
					</p>

					{formError ? (
						<p className="font-data mt-2 rounded bg-danger-soft p-2 text-[12px] text-danger">
							{String(formError)}
						</p>
					) : null}

					<div className="mt-3 space-y-2">
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="xs"
								disabled={isSubmitting}
								onClick={retry}
								className="font-data border-info/30 bg-info-soft text-[11px] text-info hover:bg-info/20"
							>
								RETRY
							</Button>
							<Button
								variant="outline"
								size="xs"
								disabled={isSubmitting}
								onClick={abort}
								className="font-data border-danger/30 bg-danger-soft text-[11px] text-danger hover:bg-danger/20"
							>
								ABORT
							</Button>
						</div>

						<div className="flex gap-2">
							<form.Field name="note">
								{(field) => (
									<Field>
										<Input
											id={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Add a note and continue..."
											className="font-data flex-1 border-border bg-surface text-[12px] text-fg placeholder-fg-dim focus:border-border-strong"
										/>
										{field.state.meta.isTouched && !field.state.meta.isValid ? (
											<FieldError errors={field.state.meta.errors} />
										) : null}
									</Field>
								)}
							</form.Field>
							<Button
								variant="outline"
								size="xs"
								disabled={isSubmitting || form.getFieldValue('note').trim().length === 0}
								onClick={continueWithNote}
								className="font-data border-success/30 bg-success-soft text-[11px] text-success hover:bg-success/20"
							>
								CONTINUE
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
