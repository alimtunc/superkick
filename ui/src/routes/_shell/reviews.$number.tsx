import { PrReviewWorkspace } from '@/components/reviews/PrReviewWorkspace'
import { ReviewsLayout } from '@/components/reviews/ReviewsLayout'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/reviews/$number',
	component: ReviewDetailPage
})

function ReviewDetailPage() {
	const { number } = useParams({ from: '/_shell/reviews/$number' })
	return (
		<ReviewsLayout>
			<PrReviewWorkspace key={number} number={Number(number)} />
		</ReviewsLayout>
	)
}
