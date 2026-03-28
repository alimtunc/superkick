import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Interrupt } from '@/types'

interface InterruptPanelProps {
	runId: string
	interrupts: Interrupt[]
	onAnswered: () => void
}
import { useInterruptForm } from '@/hooks/useInterruptForm'
import { extractFormError, parseAnswer } from '@/lib/domain'

export function InterruptPanel({ runId, interrupts, onAnswered }: InterruptPanelProps) {
	const pending = interrupts.filter((i) => i.status === 'pending')
	const resolved = interrupts.filter((i) => i.status !== 'pending')

	return (
		<div className="space-y-3">
			{pending.map((interrupt) => (
				<PendingInterrupt
					key={interrupt.id}
					runId={runId}
					interrupt={interrupt}
					onAnswered={onAnswered}
				/>
			))}

			{resolved.length > 0 && (
				<div className="space-y-2">
					<h3 className="font-data text-[10px] tracking-wider text-dim uppercase">History</h3>
					{resolved.map((interrupt) => (
						<ResolvedInterrupt key={interrupt.id} interrupt={interrupt} />
					))}
				</div>
			)}

			{interrupts.length === 0 && <p className="font-data text-sm text-dim">No interrupts.</p>}
		</div>
	)
}

function PendingInterrupt({
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
		<div className="panel glow-gold border-l-2 border-l-gold p-4">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-gold">!!</span>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-fog">{interrupt.question}</p>
					<p className="font-data mt-1 text-[10px] text-dim">
						{new Date(interrupt.created_at).toLocaleString()}
					</p>

					{formError ? (
						<p className="font-data mt-2 rounded bg-oxide-dim p-2 text-[12px] text-oxide">
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
								className="font-data border-cyan/30 bg-cyan-dim text-[11px] text-cyan hover:bg-cyan/20"
							>
								RETRY
							</Button>
							<Button
								variant="outline"
								size="xs"
								disabled={isSubmitting}
								onClick={abort}
								className="font-data border-oxide/30 bg-oxide-dim text-[11px] text-oxide hover:bg-oxide/20"
							>
								ABORT
							</Button>
						</div>

						<div className="flex gap-2">
							<form.Field
								name="note"
								children={(field) => (
									<Field>
										<Input
											id={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Add a note and continue..."
											className="font-data flex-1 border-edge bg-carbon text-[12px] text-fog placeholder-dim focus:border-edge-bright"
										/>
										{field.state.meta.isTouched && !field.state.meta.isValid ? (
											<FieldError errors={field.state.meta.errors} />
										) : null}
									</Field>
								)}
							/>
							<Button
								variant="outline"
								size="xs"
								disabled={isSubmitting || form.getFieldValue('note').trim().length === 0}
								onClick={continueWithNote}
								className="font-data border-mineral/30 bg-mineral-dim text-[11px] text-mineral hover:bg-mineral/20"
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

function ResolvedInterrupt({ interrupt }: { interrupt: Interrupt }) {
	const answer = parseAnswer(interrupt.answer_json)
	const actionLabel = answer?.action?.replace(/_/g, ' ') ?? interrupt.status

	return (
		<div className="panel p-3">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-dim">
					{interrupt.status === 'resolved' ? '\u2713' : '\u2014'}
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-[12px] text-silver">{interrupt.question}</p>
					<div className="mt-1 flex items-center gap-2">
						<span className="font-data rounded bg-edge px-1.5 py-0.5 text-[10px] text-ash">
							{actionLabel}
						</span>
						{answer?.note && <span className="text-[11px] text-dim italic">"{answer.note}"</span>}
						{interrupt.resolved_at && (
							<span className="font-data text-[10px] text-dim">
								{new Date(interrupt.resolved_at).toLocaleString()}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
