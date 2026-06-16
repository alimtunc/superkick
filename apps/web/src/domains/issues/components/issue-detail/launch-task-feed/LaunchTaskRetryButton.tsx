import { Button } from '@/components/primitives'
import { useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import { RotateCw } from 'lucide-react'

interface LaunchTaskRetryButtonProps {
	linearIssueId: string
	taskId: string
}

export function LaunchTaskRetryButton({ linearIssueId, taskId }: LaunchTaskRetryButtonProps) {
	const retry = useRetryLaunchTask({ linearIssueId, taskId })

	return (
		<Button
			variant="outline"
			size="xs"
			onClick={() => retry.mutate('fix_forward')}
			disabled={retry.isPending}
			className="font-data text-[11px]"
		>
			<RotateCw size={12} strokeWidth={1.75} aria-hidden="true" />
			{retry.isPending ? 'Retrying…' : 'Retry'}
		</Button>
	)
}
