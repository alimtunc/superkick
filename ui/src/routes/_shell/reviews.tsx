import { ReviewsIndexEmpty } from '@/components/reviews/ReviewsIndexEmpty'
import { ReviewsLayout } from '@/components/reviews/ReviewsLayout'
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
