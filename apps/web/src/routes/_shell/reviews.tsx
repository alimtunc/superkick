import { ReviewsIndexEmpty } from '@/domains/reviews/components/ReviewsIndexEmpty'
import { ReviewsLayout } from '@/domains/reviews/components/ReviewsLayout'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/reviews',
	component: ReviewsIndexPage
})

function ReviewsIndexPage() {
	return (
		<ReviewsLayout>
			<ReviewsIndexEmpty />
		</ReviewsLayout>
	)
}
