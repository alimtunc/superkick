import { useState } from 'react'

import { Button, Pill } from '@/components/primitives'
import { SettingsPaneHeader } from '@/domains/settings/components/SettingsPaneHeader'
import { SettingsRow } from '@/domains/settings/components/SettingsRow'
import { SettingsSection } from '@/domains/settings/components/SettingsSection'
import { useViewer } from '@/hooks/useViewer'
import { configureDesktopProject, isDesktopShell } from '@/lib/desktop'
import {
	activeDesktopProject,
	currentReturnPath,
	desktopProjectsQuery,
	withProjectSwitchOverlay
} from '@/lib/desktopProjects'
import { linearStatusDisplay } from '@/lib/linearStatus'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function SettingsPaneIntegrations() {
	const { viewer, loading } = useViewer()
	const desktop = isDesktopShell()
	const queryClient = useQueryClient()
	const [keyInput, setKeyInput] = useState('')

	const { data } = useQuery({ ...desktopProjectsQuery(), enabled: desktop })
	const activeProject = activeDesktopProject(data)
	const status = linearStatusDisplay(viewer, loading)

	const keyMutation = useMutation({
		mutationFn: (value: string | null) => {
			if (!activeProject) return Promise.resolve(false)
			return withProjectSwitchOverlay(
				`Restarting ${activeProject.name}…`,
				() => configureDesktopProject(activeProject.id, value, currentReturnPath()),
				'Failed to update the Linear API key'
			)
		},
		onSuccess: (applied) => {
			if (!applied) return
			setKeyInput('')
			return queryClient.invalidateQueries({ queryKey: desktopProjectsQuery().queryKey })
		}
	})

	return (
		<section>
			<SettingsPaneHeader title="Integrations" description="External services Superkick connects to." />
			<SettingsSection title="Linear">
				<SettingsRow label="Status" hint="Resolved via the Linear API">
					<Pill tone={status.tone}>{status.label}</Pill>
				</SettingsRow>
				{desktop ? (
					<SettingsRow
						label="API key"
						hint={activeProject ? `Project · ${activeProject.name}` : 'No active project'}
						last
					>
						<div className="flex flex-col items-end gap-2">
							<div className="flex items-center gap-2">
								{activeProject?.has_linear_key ? (
									<Pill tone="success">Key configured</Pill>
								) : null}
								<input
									type="password"
									className="w-56 rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
									value={keyInput}
									placeholder="lin_api_…"
									aria-label="Linear API key"
									onChange={(event) => setKeyInput(event.target.value)}
								/>
								<Button
									size="sm"
									disabled={keyMutation.isPending || !activeProject || !keyInput.trim()}
									onClick={() => keyMutation.mutate(keyInput.trim())}
								>
									Save
								</Button>
								{activeProject?.has_linear_key ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={keyMutation.isPending || !activeProject}
										onClick={() => keyMutation.mutate(null)}
									>
										Remove key
									</Button>
								) : null}
							</div>
							<span className="text-[11px] text-fg-muted">
								Saving restarts the embedded server for this project.
							</span>
						</div>
					</SettingsRow>
				) : (
					<SettingsRow
						label="API key"
						hint="Read from the LINEAR_API_KEY env var (project .env). Restart the server after changing it."
						last
					>
						<span className="text-[12px] text-fg-dim">Managed via environment</span>
					</SettingsRow>
				)}
			</SettingsSection>
		</section>
	)
}
