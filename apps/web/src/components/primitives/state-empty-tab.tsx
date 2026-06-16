import { EmptyState } from '@/components/primitives/state-empty'
import type { LucideIcon } from 'lucide-react'

interface TabEmptyStateProps {
	icon?: LucideIcon
	title: string
	description?: string
}

export function TabEmptyState({ icon, title, description }: TabEmptyStateProps) {
	return (
		<div className="px-4 py-3">
			<EmptyState icon={icon} title={title} description={description} density="compact" />
		</div>
	)
}
