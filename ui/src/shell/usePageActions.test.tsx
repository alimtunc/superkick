import { usePageActions, usePageActionsStore } from '@/shell/usePageActions'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
	usePageActionsStore.setState({
		owner: null,
		title: null,
		crumbs: null,
		sub: null,
		right: null,
		back: null
	})
})

describe('usePageActions', () => {
	it('lets a page override shell breadcrumbs for mockup-accurate topbars', () => {
		const { unmount } = renderHook(() =>
			usePageActions({
				title: 'Checkout incident',
				crumbs: ['Issues', 'checkout-web', 'In Progress']
			})
		)

		expect(usePageActionsStore.getState().crumbs).toEqual(['Issues', 'checkout-web', 'In Progress'])

		unmount()
		expect(usePageActionsStore.getState().crumbs).toBeNull()
	})
})
