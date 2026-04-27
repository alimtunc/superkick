import type { Run } from '@/types'

import { RunPauseApprovalBanner } from './RunPauseApprovalBanner'
import { RunPauseBudgetBanner } from './RunPauseBudgetBanner'

interface RunPauseBannerProps {
	run: Run
}

export function RunPauseBanner({ run }: RunPauseBannerProps) {
	switch (run.pause_kind) {
		case 'budget':
			return <RunPauseBudgetBanner run={run} />
		case 'approval':
			return <RunPauseApprovalBanner run={run} />
		case 'none':
			return null
	}
}
