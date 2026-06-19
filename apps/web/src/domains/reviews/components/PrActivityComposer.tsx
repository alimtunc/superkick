import { useCallback, useState, type KeyboardEvent } from 'react'

import { submitPrReview } from '@/api'
import { Btn, Kbd } from '@/components/primitives'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface PrActivityComposerProps {
	number: number
	headSha: string
}

export function PrActivityComposer({ number, headSha }: PrActivityComposerProps) {
	const queryClient = useQueryClient()
	const [value, setValue] = useState('')

	const mutation = useMutation({
		mutationFn: (body: string) => submitPrReview(number, { headSha, event: 'comment', body }),
		onSuccess: () => {
			setValue('')
			void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.activity(number) })
			void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.detail(number) })
		}
	})

	const trimmed = value.trim()
	const canSubmit = trimmed.length > 0 && !mutation.isPending

	const submit = useCallback(() => {
		if (canSubmit) mutation.mutate(trimmed)
	}, [canSubmit, mutation, trimmed])

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault()
				submit()
			}
		},
		[submit]
	)

	const error = mutation.error ? errorMessageOr(mutation.error, 'Could not post comment') : null

	return (
		<div className="composer">
			<div className="composer__box on-raised">
				<div className="flex items-start gap-2.5 px-3 pt-2.5">
					<textarea
						value={value}
						onChange={(event) => setValue(event.target.value)}
						onKeyDown={onKeyDown}
						disabled={mutation.isPending}
						placeholder="Leave a comment…"
						rows={2}
						className="composer__field"
						style={{ padding: 0 }}
						aria-label="Leave a comment"
					/>
				</div>
				<div className="composer__bar">
					<span className="spacer" />
					{error ? (
						<span className="text-[11px] text-danger" role="alert">
							{error}
						</span>
					) : null}
					<span className="inline-flex items-center gap-1 text-[11px] text-fg-dim">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
					</span>
					<Btn kind="primary" size="sm" icon="send" disabled={!canSubmit} onClick={submit}>
						{mutation.isPending ? 'Posting…' : 'Comment'}
					</Btn>
				</div>
			</div>
		</div>
	)
}
