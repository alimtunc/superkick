import { useState } from 'react'

import { submitPrReview } from '@/api'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import type { PrReviewEventKind, SubmitPrReviewResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface SubmitReviewBarProps {
	number: number
	headSha: string
	unresolvedCount: number
}

const EVENTS: { id: PrReviewEventKind; label: string }[] = [
	{ id: 'comment', label: 'Comment' },
	{ id: 'approve', label: 'Approve' },
	{ id: 'request_changes', label: 'Request changes' }
]

export function SubmitReviewBar({ number, headSha, unresolvedCount }: SubmitReviewBarProps) {
	const queryClient = useQueryClient()
	const [event, setEvent] = useState<PrReviewEventKind>('comment')
	const [body, setBody] = useState('')
	const [result, setResult] = useState<SubmitPrReviewResponse | null>(null)

	const mutation = useMutation({
		mutationFn: () => submitPrReview(number, { headSha, event, body }),
		onMutate: () => setResult(null),
		onSuccess: (response) => {
			setResult(response)
			setBody('')
			void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.localReview(number, headSha) })
			void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.activity(number) })
			void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.detail(number) })
		}
	})

	const requiresBody = event !== 'approve'
	const submitDisabled =
		mutation.isPending || (requiresBody && body.trim().length === 0 && unresolvedCount === 0)
	const error = mutation.error ? errorMessageOr(mutation.error, 'Submitting the review failed') : null

	return (
		<div className="bg-bg border-t border-border px-4 py-3">
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1" role="radiogroup" aria-label="Review type">
					{EVENTS.map((option) => (
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={event === option.id}
							onClick={() => setEvent(option.id)}
							className={
								event === option.id
									? 'rounded-[3px] bg-surface px-2 py-0.5 text-[11px] text-fg'
									: 'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg'
							}
						>
							{option.label}
						</button>
					))}
				</div>
				<span className="text-[11px] text-fg-dim">
					{unresolvedCount} staged comment{unresolvedCount === 1 ? '' : 's'}
				</span>
				<button
					type="button"
					onClick={() => mutation.mutate()}
					disabled={submitDisabled}
					className="ml-auto rounded-[3px] border border-border px-3 py-1 text-[12px] text-fg hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
				>
					{mutation.isPending ? 'Submitting...' : 'Submit review'}
				</button>
			</div>
			<textarea
				value={body}
				onChange={(changeEvent) => setBody(changeEvent.target.value)}
				placeholder={requiresBody ? 'Review summary (required)' : 'Optional summary'}
				aria-label="Review summary"
				rows={2}
				className="mt-2 w-full resize-y rounded-[3px] border border-border bg-surface px-2 py-1 text-[12px] text-fg placeholder:text-fg-dim"
			/>
			{result ? (
				<p className="mt-1 text-[12px] text-success" role="status">
					Review submitted — {result.anchoredComments} inline
					{result.fallbackComments > 0
						? `, ${result.fallbackComments} added to the summary (line not in diff)`
						: ''}
					.
				</p>
			) : null}
			{error ? (
				<p className="mt-1 text-[12px] text-danger" role="alert">
					{error}
				</p>
			) : null}
		</div>
	)
}
