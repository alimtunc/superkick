import { useState } from 'react'

import { LaunchComposerDialog } from '@/components/launch/LaunchComposerDialog'
import type { IssueDetailResponse } from '@/types'
import { Btn, Icon } from '@/ui'
import { toast } from 'sonner'

interface ExecutionLogIdleProps {
	issue: IssueDetailResponse
}

export function ExecutionLogIdle({ issue }: ExecutionLogIdleProps) {
	const [launchOpen, setLaunchOpen] = useState(false)

	return (
		<section aria-label="No execution yet" className="execlog">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-5)',
					padding: 'var(--space-7) var(--space-6)'
				}}
			>
				<div className="empty-state__icon" style={{ width: 36, height: 36 }}>
					<Icon name="zap" size={18} className="ic" />
				</div>
				<div style={{ flex: 1 }}>
					<div style={{ fontSize: 'var(--text-13)', fontWeight: 'var(--fw-medium)' }}>
						No execution yet on this issue.
					</div>
					<div style={{ fontSize: 'var(--text-12)', color: 'var(--fg-dim)', marginTop: 2 }}>
						Launch a task against this issue.
					</div>
				</div>
				<Btn kind="primary" size="sm" icon="play" onClick={() => setLaunchOpen(true)}>
					Launch task
				</Btn>
			</div>
			<LaunchComposerDialog
				open={launchOpen}
				onOpenChange={setLaunchOpen}
				issue={issue}
				title="Launch task"
				onLaunched={(result) => {
					setLaunchOpen(false)
					toast.success(`Launched ${result.task.linear_issue_id}`)
				}}
			/>
		</section>
	)
}
