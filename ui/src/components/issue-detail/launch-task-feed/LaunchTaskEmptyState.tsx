import { EmptyState } from '@/components/ui/state-empty'
import { Sparkles } from 'lucide-react'

export function LaunchTaskEmptyState() {
	return (
		<EmptyState
			icon={Sparkles}
			title="No Launch Task for this issue"
			description="Start a multi-agent run from the Launch panel in the sidebar."
			density="compact"
		/>
	)
}
