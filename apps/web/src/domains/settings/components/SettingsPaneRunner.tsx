import { fetchRunnerConfig } from '@/api/config'
import { AsyncSection } from '@/components/primitives'
import { RunnerConfigForm } from '@/domains/settings/components/RunnerConfigForm'
import { SettingsPaneHeader } from '@/domains/settings/components/SettingsPaneHeader'
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
