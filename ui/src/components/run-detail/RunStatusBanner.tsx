import { CompletedBanner } from '@/components/run-detail/CompletedBanner'
import { NeedsHumanBanner } from '@/components/run-detail/NeedsHumanBanner'
import type { PullRequest, Run } from '@/types'

interface RunStatusBannerProps {
	run: Run
	pr: PullRequest | null
	isTerminal: boolean
	needsHuman: boolean
}

export function RunStatusBanner({ run, pr, isTerminal, needsHuman }: RunStatusBannerProps) {
	if (needsHuman) {
		return (
			<div className="px-6 pt-5">
				<NeedsHumanBanner run={run} />
			</div>
		)
	}

	if (isTerminal) {
		return (
			<div className="px-6 pt-5">
				<CompletedBanner run={run} pr={pr} />
			</div>
		)
	}

	return null
}
