import { AppShell } from '@/components/shell/AppShell'
import { createRoute } from '@tanstack/react-router'

import { Route as rootRoute } from '../__root'

export const Route = createRoute({
	getParentRoute: () => rootRoute,
	id: '_shell',
	component: AppShell
})
