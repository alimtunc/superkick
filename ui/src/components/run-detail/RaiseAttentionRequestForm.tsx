import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRaiseAttentionRequest } from '@/hooks/useRaiseAttentionRequest'
import { extractFormError } from '@/lib/domain'
import type { AttentionKind } from '@/types'

const KINDS: readonly AttentionKind[] = ['clarification', 'decision', 'approval']

export function RaiseAttentionRequestForm({ runId, onCreated }: { runId: string; onCreated: () => void }) {
	const { form, open, setOpen, close } = useRaiseAttentionRequest(runId, onCreated)

	if (!open) {
		return (
			<Button
				variant="outline"
				size="xs"
				onClick={() => setOpen(true)}
				className="font-data border-border bg-surface text-[11px] text-fg-dim hover:text-fg"
			>
				+ raise request
			</Button>
		)
	}

	return (
		<form
			action={() => {
				void form.handleSubmit()
			}}
			className="panel border border-border p-3"
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
											? 'border-warn/60 bg-warn/15 text-warn'
											: 'border-border bg-surface text-fg-dim'
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
							className="font-data border-border bg-surface text-[12px] text-fg"
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
							className="font-data border-border bg-surface text-[12px] text-fg"
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
										className="font-data border-border bg-surface text-[12px] text-fg"
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
							<p className="font-data rounded bg-danger-soft p-2 text-[12px] text-danger">
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
								className="font-data border-success/30 bg-success-soft text-[11px] text-success"
							>
								RAISE
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={close}
								className="font-data text-[11px] text-fg-dim"
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
