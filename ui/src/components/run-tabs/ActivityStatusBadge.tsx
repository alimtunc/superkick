import type { ActivityPayload } from '@/components/run-tabs/structuredActivity'
import { Pill } from '@/components/ui/pill'

export function ActivityStatusBadge({ payload }: { payload: ActivityPayload }) {
	if (!payload.badge && !payload.status) return null
	const label = payload.badge ?? payload.status
	if (payload.status === 'fail') {
		return (
			<Pill mono size="xs" tone="danger">
				{label}
			</Pill>
		)
	}
	if (payload.status === 'green') {
		return (
			<Pill mono size="xs" tone="success">
				{label}
			</Pill>
		)
	}
	if (payload.status === 'running') {
		return (
			<Pill mono size="xs" tone="info" dot>
				{label}
			</Pill>
		)
	}
	return (
		<Pill mono size="xs" tone="neutral">
			{label}
		</Pill>
	)
}
