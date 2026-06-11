import { fetchRunnerConfig } from '@/api/config'
import { RunnerConfigForm } from '@/components/settings/RunnerConfigForm'
import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { AsyncSection } from '@/components/ui/state-async'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

export function SettingsPaneRunner() {
	const { data, isLoading, error } = useQuery({
		queryKey: queryKeys.config.runner,
		queryFn: fetchRunnerConfig
	})

	return (
		<section>
			<SettingsPaneHeader
				title="Runner"
				description="Worktree layout, base branch, and preparation commands for runs."
			/>
			<AsyncSection
				isLoading={isLoading}
				error={error ? errorMessageOr(error, 'Failed to load runner config') : null}
				isEmpty={!data}
				emptyTitle="Runner config unavailable"
			>
				{data ? <RunnerConfigForm config={data} /> : null}
			</AsyncSection>
		</section>
	)
}
